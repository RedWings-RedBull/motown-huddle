# Test fixture attribution

Small slices of real 2026 week 3 files cut from nflverse releases, used only by the unit tests
(they are test data, not a served dataset).

- `play_by_play.csv.gz`, `stats_player_week.csv`, `snap_counts.csv`, `depth_charts.csv`,
  `players.csv`, `games.csv`, `ngs_*.csv.gz`, `advstats_week_*.csv`: nflverse-data, CC-BY 4.0
  (advanced stats: Pro-Football-Reference via nflverse; schedule: nflverse / Lee Sharpe).
- `ftn_charting.csv`: FTN Data via nflverse, CC-BY-SA 4.0.

Rows are limited to four games (DET, NYJ, ATL, GB, CIN, PIT, MIN, TB); PFR and NGS rows cover the
DET game plus one other game only. Never extend these to league-wide PFR or NGS tables.
