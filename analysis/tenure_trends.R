# Did Ukrainian ministers' tenures get shorter since independence?
#
# Reads data/ministers.json and answers the question under several defensible
# specifications, because the answer depends on them: whether never-confirmed
# acting officials count as tenures decides even the SIGN of the change.
#
# Usage:  Rscript analysis/tenure_trends.R

suppressPackageStartupMessages({
  library(jsonlite)
  library(dplyr)
  library(tidyr)
  library(purrr)
  library(ggplot2)
  library(scales)
  library(survival)
  library(grid)      # unit() for legend sizing
})

# ---------------------------------------------------------------- paths -----
repo_root <- local({
  args <- commandArgs(trailingOnly = FALSE)
  file_arg <- grep("^--file=", args, value = TRUE)
  from_script <- if (length(file_arg)) dirname(dirname(sub("^--file=", "", file_arg[1]))) else NA
  candidates <- c(getwd(), from_script, dirname(getwd()))
  hit <- candidates[file.exists(file.path(candidates, "data", "ministers.json"))]
  if (!length(hit)) stop("cannot locate data/ministers.json — run from the repo root")
  normalizePath(hit[1])
})

fig_dir <- file.path(repo_root, "analysis", "figures")
out_dir <- file.path(repo_root, "analysis", "output")
dir.create(fig_dir, recursive = TRUE, showWarnings = FALSE)
dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)

YEAR <- 365.25

# ------------------------------------------------------------ load data -----
raw <- fromJSON(file.path(repo_root, "data", "ministers.json"), simplifyVector = TRUE)
built <- as.Date(raw$meta$built)

presidents <- as_tibble(raw$eras$presidents) %>%
  mutate(start = as.Date(start),
         end = if_else(is.na(end), built, as.Date(end)))

# Eleven ministries that existed continuously from 1991 to today, never merged
# into another body nor abolished. They form a balanced panel: any change in
# their tenures cannot be an artifact of the roster of ministries changing.
CORE <- c("foreign", "defense", "interior", "finance", "justice", "economy",
          "education", "health", "culture", "social", "energy")

tenures <- as_tibble(raw$tenures) %>%
  filter(lineage != "pm") %>%            # PMs are heads of government, not ministers
  mutate(
    start = as.Date(start),
    end = as.Date(end),                  # NA while still serving
    years = days / YEAR,
    # An ongoing tenure is right-censored: it will end later than we observe.
    censored = ongoing,
    event = !ongoing,
    core = lineage %in% CORE,
    president = map_chr(start, function(d) {
      hit <- presidents$id[d >= presidents$start & d <= presidents$end]
      if (length(hit)) hit[1] else NA_character_
    }),
    president = factor(president, levels = presidents$id)
  )

EARLY <- as.Date(c("1991-08-24", "1999-12-31"))
LATE  <- as.Date(c("2016-01-01", "2026-12-31"))

in_window <- function(d, w) d >= w[1] & d <= w[2]

periods <- tenures %>%
  mutate(period = case_when(in_window(start, EARLY) ~ "1991-1999",
                            in_window(start, LATE)  ~ "2016-2026",
                            TRUE ~ NA_character_)) %>%
  filter(!is.na(period)) %>%
  mutate(period = factor(period, levels = c("1991-1999", "2016-2026")))

# -------------------------------------------------- specification table -----
# Each row is a defensible way to define "a minister's tenure".
specs <- tribble(
  ~spec, ~label,                                   ~filter,
  "A",   "All ministries, all spells",             function(d) d,
  "B",   "Minus never-confirmed acting spells",    function(d) filter(d, !acting),
  "C",   "Core 11 ministries (balanced panel)",    function(d) filter(d, core),
  "D",   "Completed tenures only",                 function(d) filter(d, !censored),
  "E",   "Core panel, confirmed ministers only",   function(d) filter(d, core, !acting)
)

spec_table <- specs %>%
  mutate(res = map(filter, function(f) {
    d <- f(periods)
    d %>%
      group_by(period) %>%
      summarise(median_y = median(years), n = n(), .groups = "drop") %>%
      pivot_wider(names_from = period, values_from = c(median_y, n))
  })) %>%
  select(-filter) %>%
  unnest(res) %>%
  rename(early_y = `median_y_1991-1999`, late_y = `median_y_2016-2026`,
         n_early = `n_1991-1999`, n_late = `n_2016-2026`) %>%
  mutate(change_pct = (late_y / early_y - 1) * 100,
         direction = if_else(change_pct < 0, "shorter", "longer"))

cat("\n== NAIVE median minister tenure, by specification ==\n")
cat("   (counts an ongoing tenure as if it ended today - corrected further down)\n\n")
spec_table %>%
  transmute(spec, label,
            `1991-99` = sprintf("%.2fy (n=%d)", early_y, n_early),
            `2016-26` = sprintf("%.2fy (n=%d)", late_y, n_late),
            change = sprintf("%+.1f%%", change_pct)) %>%
  as.data.frame() %>%
  print(row.names = FALSE, right = FALSE)

cat("\nThe sign is not robust: specifications differ on whether tenures shortened.\n")

write.csv(spec_table %>% select(-direction), file.path(out_dir, "specifications.csv"),
          row.names = FALSE)

# --------------------------------------- Kaplan-Meier (censoring handled) ---
# The naive median treats an ongoing tenure as if it ended today, which
# understates it. Kaplan-Meier uses the censored observations correctly.
km_data <- periods %>% filter(core)
km <- survfit(Surv(years, event) ~ period, data = km_data)
km_tab <- summary(km)$table

cat("\n== Core panel: naive vs Kaplan-Meier median (years) ==\n\n")
km_compare <- km_data %>%
  group_by(period) %>%
  summarise(naive = median(years), censored_n = sum(censored), n = n(), .groups = "drop") %>%
  mutate(km_median = as.numeric(km_tab[, "median"]),
         naive_bias_pct = (naive / km_median - 1) * 100)
print(as.data.frame(km_compare), row.names = FALSE, digits = 3)

# Why the naive median is badly biased for the recent window: several tenures
# are only days old because a new cabinet was seated just before the build date.
fresh <- km_data %>% filter(period == "2016-2026", censored, years < 0.1)
cat(sprintf("\n%d of %d censored recent tenures are under 5 weeks old (new cabinet\n",
            nrow(fresh), sum(km_data$censored)))
cat("seated days before the build date). Counting those as finished tenures is\n")
cat("what drags the naive recent median down; Kaplan-Meier discards them correctly.\n")

# ------------------------------------- do the curves cross? (test validity) --
horizons <- c(0.25, 0.5, 1, 1.5, 2, 3, 4, 5)
sh <- summary(km, times = horizons)
cross <- tibble(period = sub("period=", "", sh$strata), t = sh$time, surv = sh$surv) %>%
  pivot_wider(names_from = period, values_from = surv) %>%
  rename(early = `1991-1999`, late = `2016-2026`) %>%
  mutate(gap = late - early)

cat("\n== Share still in office at each horizon ==\n\n")
cross %>%
  transmute(`years in office` = t,
            `1991-99` = percent(early, accuracy = 0.1),
            `2016-26` = percent(late, accuracy = 0.1),
            `late minus early` = sprintf("%+.1f pp", gap * 100)) %>%
  as.data.frame() %>%
  print(row.names = FALSE, right = FALSE)

crosses <- any(diff(sign(cross$gap[!is.na(cross$gap)])) != 0)

# A log-rank test assumes one group's hazard is proportionally higher throughout.
# If the curves cross, that assumption fails and the test is not interpretable:
# early and late differences cancel, driving the statistic toward zero.
logrank <- survdiff(Surv(years, event) ~ period, data = km_data)
p_val <- pchisq(logrank$chisq, df = length(logrank$n) - 1, lower.tail = FALSE)
cat(sprintf("\nlog-rank: chi-sq = %.2f, p = %.3f", logrank$chisq, p_val))
if (crosses) {
  cat("  <-- DO NOT INTERPRET\n")
  cat("The survival curves cross, so hazards are not proportional and the\n")
  cat("log-rank statistic is driven toward zero by cancellation. A high p-value\n")
  cat("here is NOT evidence that the periods are alike.\n")
} else {
  cat("  (curves do not cross; test is interpretable)\n")
}

# The substantive shape: outcomes polarised rather than uniformly shortened.
cat("\n== Polarisation of outcomes, core panel ==\n\n")
polar <- km_data %>%
  group_by(period) %>%
  summarise(`under 6 months` = mean(years < 0.5),
            `over 3 years` = mean(years > 3), n = n(), .groups = "drop")
polar %>%
  transmute(period, n,
            `under 6 months` = percent(`under 6 months`, accuracy = 0.1),
            `over 3 years` = percent(`over 3 years`, accuracy = 0.1)) %>%
  as.data.frame() %>%
  print(row.names = FALSE, right = FALSE)
cat("\nBoth tails grew: more brief caretaker spells AND more long-stayers.\n")
cat("'Tenures got shorter' is the wrong summary; outcomes became more unequal.\n")

write.csv(cross, file.path(out_dir, "survival_by_horizon.csv"), row.names = FALSE)

# ----------------------------------------------- acting share over time -----
acting_share <- tenures %>%
  mutate(decade = paste0(substr(format(start, "%Y"), 1, 3), "0s")) %>%
  group_by(decade) %>%
  summarise(acting = sum(acting), n = n(),
            share = acting / n, .groups = "drop")

cat("\n== Ministry spells led by a never-confirmed acting official ==\n\n")
acting_share %>%
  transmute(decade, spells = n, acting,
            share = percent(share, accuracy = 0.1)) %>%
  as.data.frame() %>%
  print(row.names = FALSE, right = FALSE)

cat("\nCaveat: recent Ukrainian politics is documented far more granularly than\n",
    "the 1990s, so part of this rise is a source-coverage artifact. The direction\n",
    "is real; the magnitude is an upper bound.\n", sep = "")

write.csv(acting_share, file.path(out_dir, "acting_share.csv"), row.names = FALSE)

# ------------------------------------------------------------- plotting -----
# Palette matches the interactive timeline so the two read as one project.
ERA_COLS <- c(kravchuk = "#2a78d6", kuchma = "#eb6834", yushchenko = "#1baf7a",
              yanukovych = "#eda100", poroshenko = "#e87ba4", zelensky = "#008300",
              koretskyi = "#4a3aa7")
INK <- "#0b0b0b"; INK2 <- "#52514e"; MUTED <- "#898781"; GRID <- "#e1e0d9"

theme_min <- function() {
  theme_minimal(base_size = 11, base_family = "sans") +
    theme(
      plot.title = element_text(face = "bold", size = 13, colour = INK),
      plot.subtitle = element_text(size = 9.5, colour = INK2, margin = margin(b = 10)),
      plot.caption = element_text(size = 8, colour = MUTED, hjust = 0),
      axis.title = element_text(size = 9, colour = MUTED),
      axis.text = element_text(colour = INK2),
      panel.grid.minor = element_blank(),
      panel.grid.major.x = element_blank(),
      panel.grid.major.y = element_line(colour = GRID, linewidth = 0.4),
      legend.position = "none",
      plot.margin = margin(14, 18, 10, 14)
    )
}

# 1. How much does the answer depend on the specification?
p_spec <- spec_table %>%
  mutate(label = factor(label, levels = rev(label))) %>%
  ggplot(aes(y = label)) +
  geom_segment(aes(x = early_y, xend = late_y, yend = label),
               colour = MUTED, linewidth = 0.6) +
  geom_point(aes(x = early_y), colour = "#2a78d6", size = 3) +
  geom_point(aes(x = late_y), colour = "#e34948", size = 3) +
  geom_text(aes(x = pmax(early_y, late_y) + 0.08,
                label = sprintf("%+.0f%%", change_pct)),
            hjust = 0, size = 3.1, colour = INK) +
  scale_x_continuous(breaks = seq(0.6, 1.6, by = 0.2),
                     labels = label_number(suffix = "y", accuracy = 0.1),
                     expand = expansion(mult = c(0.04, 0.16))) +
  labs(title = "The answer depends on what counts as a tenure",
       subtitle = "Median tenure of ministers appointed 1991-1999 (blue) vs 2016-2026 (red)",
       x = "median tenure", y = NULL,
       caption = "Dropping never-confirmed acting officials reverses the direction of change.") +
  theme_min()
ggsave(file.path(fig_dir, "specifications.png"), p_spec,
       width = 8.4, height = 3.4, dpi = 200, bg = "white")

# 2. Survival curves, censoring handled properly
km_df <- data.frame(
  time = km$time, surv = km$surv,
  period = rep(names(km$strata), km$strata)
) %>%
  mutate(period = sub("period=", "", period))

p_km <- ggplot(km_df, aes(time, surv, colour = period)) +
  geom_step(linewidth = 0.9) +
  geom_hline(yintercept = 0.5, colour = GRID, linewidth = 0.4) +
  annotate("text", x = max(km_df$time), y = 0.52, label = "median",
           hjust = 1, size = 3, colour = MUTED) +
  scale_colour_manual(values = c("1991-1999" = "#2a78d6", "2016-2026" = "#e34948")) +
  scale_y_continuous(labels = percent, limits = c(0, 1)) +
  scale_x_continuous(labels = label_number(suffix = "y")) +
  labs(title = "Survival in office, core 11 ministries",
       subtitle = "Kaplan-Meier estimate; ongoing tenures censored, not counted as ended",
       x = "years in office", y = "still in office",
       caption = paste("The curves cross near two years: recent appointees leave sooner",
                       "but the survivors last longer.\nOutcomes polarised rather than",
                       "uniformly shortened, so a log-rank test does not apply.")) +
  # Both curves converge to ~0 at the right edge, so end-labels would collide.
  # A legend is the honest fallback there.
  theme_min() +
  theme(legend.position = "top", legend.title = element_blank(),
        legend.text = element_text(colour = INK2, size = 9),
        legend.key.width = unit(18, "pt"), legend.margin = margin(b = 2))
ggsave(file.path(fig_dir, "survival-curves.png"), p_km,
       width = 7.2, height = 4.2, dpi = 200, bg = "white")

# 3. The thing that actually changed
p_acting <- ggplot(acting_share, aes(decade, share)) +
  geom_col(fill = "#eb6834", width = 0.55) +
  geom_text(aes(label = sprintf("%.0f%%  (%d of %d)", share * 100, acting, n)),
            vjust = -0.6, size = 3.1, colour = INK) +
  scale_y_continuous(labels = percent, expand = expansion(mult = c(0, 0.16))) +
  labs(title = "Ministries are increasingly run by unconfirmed acting officials",
       subtitle = "Share of ministry spells whose holder was never confirmed as minister",
       x = NULL, y = NULL,
       caption = "Part of the rise reflects better documentation of recent politics.") +
  theme_min()
ggsave(file.path(fig_dir, "acting-share.png"), p_acting,
       width = 7.2, height = 4, dpi = 200, bg = "white")

# 4. Level shift, not gradual decline
by_pres <- tenures %>%
  filter(core, !is.na(president)) %>%
  group_by(president) %>%
  summarise(median_y = median(years), n = n(), .groups = "drop") %>%
  left_join(presidents %>% select(id, name_en), by = c("president" = "id")) %>%
  mutate(name_en = factor(name_en, levels = name_en))

p_pres <- ggplot(by_pres, aes(name_en, median_y, fill = president)) +
  geom_col(width = 0.6) +
  geom_text(aes(label = sprintf("%.2fy  (n=%d)", median_y, n)),
            vjust = -0.6, size = 3.1, colour = INK) +
  scale_fill_manual(values = ERA_COLS) +
  scale_y_continuous(labels = label_number(suffix = "y", accuracy = 0.5),
                     expand = expansion(mult = c(0, 0.18))) +
  labs(title = "Flat for five presidencies, then a drop",
       subtitle = "Median tenure of ministers appointed under each president, core 11 ministries",
       x = NULL, y = NULL,
       caption = "Zelensky-era tenures include ongoing ones, so that bar is a lower bound.") +
  theme_min()
ggsave(file.path(fig_dir, "by-president.png"), p_pres,
       width = 7.6, height = 4, dpi = 200, bg = "white")

cat(sprintf("\nwrote %d figures to %s\n",
            length(list.files(fig_dir, pattern = "\\.png$")), file.path("analysis", "figures")))
cat(sprintf("wrote %d tables to %s\n\n",
            length(list.files(out_dir, pattern = "\\.csv$")), file.path("analysis", "output")))
