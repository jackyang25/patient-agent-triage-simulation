"""
Statistical harness (Layer 3) for the escalation evaluation framework.

Consumes per-simulation temporal features from the app's /api/export endpoint
and produces:
  1. Survival analysis — time-to-escalation by communication profile
  2. Mixed-effects models — separating scenario difficulty from profile effect
  3. Change-point detection — where agent behavior shifts within conversations
  4. Summary report printed to stdout

Usage:
    python analysis/harness.py [--url http://localhost:3000] [--file export.json]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import matplotlib
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import ruptures as rpt
from lifelines import KaplanMeierFitter, CoxPHFitter
from lifelines.statistics import logrank_test


def load_data(url: str | None, filepath: str | None) -> pd.DataFrame:
    """Load simulation export from the app API or a local JSON file."""
    if filepath:
        with open(filepath) as f:
            rows = json.load(f)
    elif url:
        import requests
        resp = requests.get(f"{url.rstrip('/')}/api/export", timeout=30)
        resp.raise_for_status()
        rows = resp.json()
    else:
        raise ValueError("Provide --url or --file")

    df = pd.DataFrame(rows)
    if df.empty:
        print("No completed simulations found. Run some simulations first.")
        sys.exit(0)
    return df


# ---------------------------------------------------------------------------
# 1. Survival analysis
# ---------------------------------------------------------------------------

def survival_analysis(df: pd.DataFrame, out_dir: Path) -> dict:
    """
    Kaplan-Meier + Cox PH on time-to-escalation.

    For scenarios where should_escalate=True, model the number of turns
    until the agent escalates (or censored at max turns if it didn't).
    """
    esc_df = df[df["should_escalate"]].copy()
    if esc_df.empty:
        print("  No escalate-labeled scenarios in data, skipping survival analysis.")
        return {}

    esc_df["event"] = esc_df["agent_escalated"].astype(int)
    esc_df["duration"] = esc_df["total_turns"].fillna(12)

    # Kaplan-Meier per profile
    fig, ax = plt.subplots(figsize=(10, 6))
    profiles = sorted(esc_df["profile_id"].unique())
    km_results = {}

    for profile in profiles:
        mask = esc_df["profile_id"] == profile
        subset = esc_df[mask]
        if subset.empty:
            continue

        kmf = KaplanMeierFitter()
        kmf.fit(subset["duration"], subset["event"], label=profile)
        kmf.plot_survival_function(ax=ax)

        km_results[profile] = {
            "median_time_to_escalation": (
                float(kmf.median_survival_time_)
                if np.isfinite(kmf.median_survival_time_)
                else None
            ),
            "n": int(len(subset)),
            "events": int(subset["event"].sum()),
        }

    ax.set_xlabel("Conversation Turns")
    ax.set_ylabel("Probability of Not Yet Escalating")
    ax.set_title("Time-to-Escalation by Communication Profile")
    ax.legend(loc="best")
    fig.tight_layout()
    fig.savefig(out_dir / "survival_curves.png", dpi=150)
    plt.close(fig)

    # Log-rank test: do profiles differ significantly?
    logrank_results = {}
    if len(profiles) >= 2:
        for i, p1 in enumerate(profiles):
            for p2 in profiles[i + 1:]:
                s1 = esc_df[esc_df["profile_id"] == p1]
                s2 = esc_df[esc_df["profile_id"] == p2]
                if s1.empty or s2.empty:
                    continue
                result = logrank_test(
                    s1["duration"], s2["duration"],
                    s1["event"], s2["event"],
                )
                logrank_results[f"{p1}_vs_{p2}"] = {
                    "test_statistic": float(result.test_statistic),
                    "p_value": float(result.p_value),
                }

    # Cox PH: profile as covariate
    cox_results = {}
    if len(profiles) >= 2 and len(esc_df) >= 10:
        cox_df = esc_df[["duration", "event", "profile_id"]].copy()
        dummies = pd.get_dummies(cox_df["profile_id"], prefix="profile", drop_first=True)
        cox_df = pd.concat([cox_df.drop(columns="profile_id"), dummies], axis=1)

        try:
            cph = CoxPHFitter()
            cph.fit(cox_df, duration_col="duration", event_col="event")

            fig2, ax2 = plt.subplots(figsize=(8, 4))
            cph.plot(ax=ax2)
            ax2.set_title("Cox PH — Hazard Ratios by Profile")
            fig2.tight_layout()
            fig2.savefig(out_dir / "cox_hazard_ratios.png", dpi=150)
            plt.close(fig2)

            cox_results = {
                col: {
                    "hazard_ratio": float(np.exp(cph.params_[col])),
                    "p_value": float(cph.summary.loc[col, "p"]),
                    "ci_lower": float(np.exp(cph.confidence_intervals_.loc[col].iloc[0])),
                    "ci_upper": float(np.exp(cph.confidence_intervals_.loc[col].iloc[1])),
                }
                for col in dummies.columns
            }
        except Exception as e:
            print(f"  Cox PH failed (likely too few observations): {e}")

    return {
        "kaplan_meier": km_results,
        "logrank_tests": logrank_results,
        "cox_ph": cox_results,
    }


# ---------------------------------------------------------------------------
# 2. Mixed-effects model
# ---------------------------------------------------------------------------

def mixed_effects_analysis(df: pd.DataFrame) -> dict:
    """
    Model signal_recognition_turn as a function of profile (fixed)
    and scenario (random), using a linear mixed-effects model.
    """
    me_df = df.dropna(subset=["signal_recognition_turn"]).copy()
    if len(me_df) < 10:
        print("  Too few observations with signal recognition data, skipping mixed-effects.")
        return {}

    profiles = sorted(me_df["profile_id"].unique())
    if len(profiles) < 2:
        print("  Only one profile present, skipping mixed-effects.")
        return {}

    dummies = pd.get_dummies(me_df["profile_id"], prefix="profile", drop_first=True)
    me_df = pd.concat([me_df, dummies], axis=1)

    exog_cols = list(dummies.columns)

    try:
        import statsmodels.formula.api as smf

        formula_parts = ["signal_recognition_turn ~ 1"]
        for col in exog_cols:
            safe_col = col.replace("-", "_").replace(" ", "_")
            me_df = me_df.rename(columns={col: safe_col})
            formula_parts[0] += f" + {safe_col}"

        me_df["scenario_id_cat"] = me_df["scenario_id"].astype("category")

        model = smf.mixedlm(
            formula_parts[0],
            me_df,
            groups=me_df["scenario_id_cat"],
        )
        result = model.fit(reml=True)

        coefficients = {}
        for name in result.params.index:
            coefficients[name] = {
                "coefficient": float(result.params[name]),
                "std_err": float(result.bse[name]),
                "p_value": float(result.pvalues[name]),
            }

        return {
            "dependent_variable": "signal_recognition_turn",
            "fixed_effect": "profile_id",
            "random_effect": "scenario_id",
            "n_observations": int(len(me_df)),
            "coefficients": coefficients,
            "group_variance": float(result.cov_re.iloc[0, 0]) if hasattr(result.cov_re, "iloc") else None,
            "log_likelihood": float(result.llf),
        }
    except Exception as e:
        print(f"  Mixed-effects model failed: {e}")
        return {}


# ---------------------------------------------------------------------------
# 3. Change-point detection
# ---------------------------------------------------------------------------

def changepoint_analysis(df: pd.DataFrame, out_dir: Path) -> dict:
    """
    For each conversation's escalation convergence trajectory,
    detect change points where agent behavior shifted direction.
    Aggregate: what triggers shifts?
    """
    trajectories = df.dropna(subset=["escalation_convergence"]).copy()
    if trajectories.empty:
        print("  No convergence data, skipping change-point detection.")
        return {}

    change_turns: list[int] = []
    conversations_with_change = 0
    conversations_without_change = 0

    for _, row in trajectories.iterrows():
        signal = row["escalation_convergence"]
        if not isinstance(signal, list) or len(signal) < 3:
            conversations_without_change += 1
            continue

        arr = np.array(signal, dtype=float)
        try:
            algo = rpt.Pelt(model="l2", min_size=1, jump=1).fit(arr)
            breakpoints = algo.predict(pen=1.0)
            # ruptures returns indices including the last element; filter it out
            internal = [bp for bp in breakpoints if bp < len(arr)]

            if internal:
                conversations_with_change += 1
                change_turns.extend(internal)
            else:
                conversations_without_change += 1
        except Exception:
            conversations_without_change += 1

    if not change_turns:
        return {
            "conversations_with_change": conversations_with_change,
            "conversations_without_change": conversations_without_change,
        }

    turn_counts = pd.Series(change_turns).value_counts().sort_index()

    fig, ax = plt.subplots(figsize=(8, 4))
    ax.bar(turn_counts.index, turn_counts.values, color="#60a5fa")
    ax.set_xlabel("Agent Turn Index (within convergence trajectory)")
    ax.set_ylabel("Number of Change Points")
    ax.set_title("Where Agent Behavior Shifts")
    fig.tight_layout()
    fig.savefig(out_dir / "changepoints.png", dpi=150)
    plt.close(fig)

    return {
        "conversations_with_change": conversations_with_change,
        "conversations_without_change": conversations_without_change,
        "mean_first_change_turn": float(np.mean(change_turns)),
        "change_turn_distribution": {int(k): int(v) for k, v in turn_counts.items()},
    }


# ---------------------------------------------------------------------------
# 4. Summary report
# ---------------------------------------------------------------------------

def print_report(survival: dict, mixed: dict, changepoints: dict) -> None:
    """Print a human-readable summary to stdout."""
    print("\n" + "=" * 60)
    print("LAYER 3 — STATISTICAL HARNESS REPORT")
    print("=" * 60)

    # Survival
    print("\n--- Survival Analysis ---")
    km = survival.get("kaplan_meier", {})
    for profile, stats in km.items():
        median = stats["median_time_to_escalation"]
        median_str = f"Turn {median:.1f}" if median else "Never (censored)"
        print(f"  {profile}: median time-to-escalation = {median_str}  (n={stats['n']}, events={stats['events']})")

    logrank = survival.get("logrank_tests", {})
    for pair, stats in logrank.items():
        sig = "***" if stats["p_value"] < 0.001 else "**" if stats["p_value"] < 0.01 else "*" if stats["p_value"] < 0.05 else ""
        print(f"  Log-rank {pair}: p={stats['p_value']:.4f} {sig}")

    cox = survival.get("cox_ph", {})
    for covariate, stats in cox.items():
        hr = stats["hazard_ratio"]
        p = stats["p_value"]
        ci = f"[{stats['ci_lower']:.2f}, {stats['ci_upper']:.2f}]"
        sig = "***" if p < 0.001 else "**" if p < 0.01 else "*" if p < 0.05 else ""
        print(f"  Cox PH {covariate}: HR={hr:.2f} {ci}, p={p:.4f} {sig}")

    # Mixed effects
    print("\n--- Mixed-Effects Model ---")
    if mixed:
        print(f"  DV: {mixed['dependent_variable']}, Fixed: {mixed['fixed_effect']}, Random: {mixed['random_effect']}")
        print(f"  N={mixed['n_observations']}, Log-likelihood={mixed.get('log_likelihood', 'N/A')}")
        gv = mixed.get("group_variance")
        if gv is not None:
            print(f"  Scenario (random) variance: {gv:.3f}")
        for name, coef in mixed.get("coefficients", {}).items():
            sig = "***" if coef["p_value"] < 0.001 else "**" if coef["p_value"] < 0.01 else "*" if coef["p_value"] < 0.05 else ""
            print(f"  {name}: coef={coef['coefficient']:.3f}, SE={coef['std_err']:.3f}, p={coef['p_value']:.4f} {sig}")
    else:
        print("  Skipped (insufficient data)")

    # Change points
    print("\n--- Change-Point Detection ---")
    if changepoints:
        total = changepoints.get("conversations_with_change", 0) + changepoints.get("conversations_without_change", 0)
        with_change = changepoints.get("conversations_with_change", 0)
        print(f"  {with_change}/{total} conversations had a behavioral shift")
        mean_turn = changepoints.get("mean_first_change_turn")
        if mean_turn:
            print(f"  Mean change-point turn: {mean_turn:.1f}")
    else:
        print("  Skipped (insufficient data)")

    print("\n" + "=" * 60)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Layer 3 statistical harness")
    parser.add_argument("--url", default="http://localhost:3000", help="App base URL")
    parser.add_argument("--file", help="Path to exported JSON file (alternative to --url)")
    parser.add_argument("--out", default="analysis/output", help="Output directory for plots and report")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    print("Loading simulation data...")
    df = load_data(args.url if not args.file else None, args.file)
    print(f"  {len(df)} completed simulations loaded.")

    has_temporal = df["signal_recognition_turn"].notna().sum()
    print(f"  {has_temporal} with temporal features.")

    print("\nRunning survival analysis...")
    survival = survival_analysis(df, out_dir)

    print("Running mixed-effects model...")
    mixed = mixed_effects_analysis(df)

    print("Running change-point detection...")
    changepoints = changepoint_analysis(df, out_dir)

    # Save structured results
    results = {
        "survival": survival,
        "mixed_effects": mixed,
        "changepoints": changepoints,
        "meta": {
            "total_simulations": len(df),
            "with_temporal": int(has_temporal),
            "profiles": sorted(df["profile_id"].unique().tolist()),
            "scenarios": sorted(df["scenario_id"].unique().tolist()),
        },
    }
    results_path = out_dir / "results.json"
    with open(results_path, "w") as f:
        json.dump(results, f, indent=2)

    print_report(survival, mixed, changepoints)
    print(f"\nPlots saved to {out_dir}/")
    print(f"Structured results saved to {results_path}")


if __name__ == "__main__":
    main()
