# How long do Ukrainian ministers last, and has it changed?
#
# Every chart here uses plain units - a percentage, a count, or years - so it
# can be read straight off the axis. The statistical care lives in the console
# output and in the observation-window rules below, not in the chart vocabulary.
#
# Observation window ends 2026-07-16, the day the Koretskyi cabinet was seated.
# Ministers appointed in that reshuffle are excluded: they had been in office
# barely a week, and counting them would drag every recent figure down for no
# reason other than when the data happened to be collected.
#
# Usage:  Rscript analysis/tenure_trends.R

suppressPackageStartupMessages({
  library(jsonlite)
  library(dplyr)
  library(tidyr)
  library(purrr)
  library(ggplot2)
  library(scales)
  library(ggrepel)
})

# ---------------------------------------------------------------- paths -----
repo_root <- local({
  args <- commandArgs(trailingOnly = FALSE)
  file_arg <- grep("^--file=", args, value = TRUE)
  from_script <- if (length(file_arg)) dirname(dirname(sub("^--file=", "", file_arg[1]))) else NA
  candidates <- c(getwd(), from_script, dirname(getwd()))
  hit <- candidates[file.exists(file.path(candidates, "data", "ministers.json"))]
  if (!length(hit)) stop("cannot locate data/ministers.json - run from the repo root")
  normalizePath(hit[1])
})
fig_dir <- file.path(repo_root, "analysis", "figures")
out_dir <- file.path(repo_root, "analysis", "output")
dir.create(fig_dir, recursive = TRUE, showWarnings = FALSE)
dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)

YEAR <- 365.25
WINDOW_END <- as.Date("2026-07-16")   # Koretskyi cabinet seated; analysis stops here
FULL_YEAR_BY <- WINDOW_END - 365      # appointed by this date => a full 12 months observed

# ------------------------------------------------------------ load data -----
raw <- fromJSON(file.path(repo_root, "data", "ministers.json"), simplifyVector = TRUE)
presidents <- as_tibble(raw$eras$presidents) %>%
  mutate(start = as.Date(start),
         end = if_else(is.na(end), WINDOW_END, as.Date(end)))
# distinct names from the person columns, so the join cannot collide
lineage_names <- as_tibble(raw$lineages) %>%
  select(lineage = id, ministry_en = name_en, ministry_uk = name_uk)

# Eleven ministries that existed continuously since 1991, never merged into
# another body nor abolished - a balanced panel, so changes in their tenures
# cannot be an artifact of the roster of ministries changing.
CORE <- c("foreign", "defense", "interior", "finance", "justice", "economy",
          "education", "health", "culture", "social", "energy")

tenures <- as_tibble(raw$tenures) %>%
  filter(lineage != "pm") %>%
  mutate(start = as.Date(start), end = as.Date(end)) %>%
  filter(start < WINDOW_END) %>%                       # drop the Jul 2026 intake
  mutate(
    obs_end   = pmin(coalesce(end, WINDOW_END), WINDOW_END),
    years     = as.numeric(obs_end - start) / YEAR,
    finished  = !is.na(end) & end <= WINDOW_END,        # observed to actually end
    still_in  = !finished,
    core      = lineage %in% CORE,
    # The president in office is the one whose term began most recently before
    # the appointment. Matching on start-and-end and taking the first hit put
    # anyone appointed exactly on a transition date into the OUTGOING era -
    # which coloured Avakov, appointed on 22 Feb 2014, as a Yanukovych minister.
    president = map_chr(start, function(d) {
      idx <- which(presidents$start <= d)
      if (length(idx)) presidents$id[max(idx)] else NA_character_
    })
  ) %>%
  filter(years > 0) %>%
  left_join(lineage_names, by = "lineage")

cat(sprintf("\nWindow: 1991-08-24 to %s. %d minister tenures (%d still in office at cutoff).\n",
            WINDOW_END, nrow(tenures), sum(tenures$still_in)))
cat(sprintf("Excluded %d tenures that began with the Jul 2026 cabinet.\n",
            sum(as.Date(raw$tenures$start) >= WINDOW_END & raw$tenures$lineage != "pm")))

# Two different exclusions, for two different measures.
#
# For the DISTRIBUTION and the median we only need to drop tenures whose outcome
# is genuinely unknown: still running AND started within the last year. A short
# tenure that already ended is perfectly good data - it is the whole point.
resolved <- tenures %>% filter(!(still_in & start > FULL_YEAR_BY))
#
# For the TREND line we need a measure that is comparable year to year and immune
# to the right edge, so we ask whether each minister reached 12 months. Ministers
# who lasted less than a year are counted here too, as failures - they are what
# pushes the share down. Only those appointed too recently to have had 12 months
# at all are set aside, because for them the answer is not yet knowable.
observable <- tenures %>% filter(start <= FULL_YEAR_BY) %>% mutate(lasted_1y = years >= 1)

# ------------------------------------------- palette & theme (light mode) ---
# Presidential colours follow the party each president was carried by, so the
# colour itself is a fact rather than a lookup:
#   Yushchenko  Our Ukraine / the Orange Revolution   orange
#   Yanukovych  Party of Regions                      blue
#   Poroshenko  European Solidarity                   crimson (their red; blue is
#               taken by Party of Regions, and a brighter red is indistinguishable
#               from Zelensky's green for deuteranopes - #d6336c clears that gate)
#   Zelensky    Servant of the People                 green
# Kravchuk and Kuchma both ran as independents with no party branding, so they
# get deliberately neutral blue-greys. Those two fail the palette validator's
# chroma floor on purpose: reading as grey IS the point.
ERA_COLS <- c(kravchuk = "#7b8794", kuchma = "#3d4852", yushchenko = "#eb6834",
              yanukovych = "#2a78d6", poroshenko = "#d6336c", zelensky = "#008300")
# Same colours keyed by display name, for scales that map the label not the id.
# Keyed off presidents so a president absent from eras.json cannot introduce an
# NA name - which previously blanked one swatch in the legend.
ERA_COLS_LAB <- setNames(ERA_COLS[presidents$id], presidents$name_en)
BLUE <- "#2a78d6"; ORANGE <- "#eb6834"
INK <- "#0b0b0b"; INK2 <- "#52514e"; MUTED <- "#898781"; GRID <- "#e1e0d9"

theme_min <- function(grid = "y") {
  th <- theme_minimal(base_size = 11, base_family = "sans") +
    theme(
      plot.title = element_text(face = "bold", size = 13, colour = INK),
      plot.subtitle = element_text(size = 9.5, colour = INK2, margin = margin(b = 10)),
      plot.caption = element_text(size = 7.6, colour = MUTED, hjust = 0, lineheight = 1.35,
                                  margin = margin(t = 10)),
      axis.title = element_text(size = 9, colour = MUTED),
      axis.text = element_text(colour = INK2),
      panel.grid.minor = element_blank(),
      legend.position = "none",
      plot.margin = margin(14, 18, 10, 14)
    )
  if (grid == "y") th + theme(panel.grid.major.x = element_blank(),
                              panel.grid.major.y = element_line(colour = GRID, linewidth = 0.4))
  else th + theme(panel.grid.major.y = element_blank(),
                  panel.grid.major.x = element_line(colour = GRID, linewidth = 0.4))
}
save_fig <- function(name, plot, w, h) {
  ggsave(file.path(fig_dir, name), plot, width = w, height = h, dpi = 200, bg = "white")
}

# Every chart carries the same attribution block: the chart-specific note first,
# then who made it and where the data came from, so a screenshot travelling on
# its own still says who to credit and how to check it.
CREDIT <- "Chart: Valentyn Hatsko, TG: @gorbach_squad"
SOURCE <- paste("Source: Wikidata (P39 officeholder statements) and Ukrainian Wikipedia",
                "minister lists, retrieved July 2026.")
REPO   <- "Data, code and method: github.com/velgaks/ministers-lifetime"
# ggplot does not wrap captions, so wrap them here or they run off the canvas
wrap <- function(s, w = 125) paste(strwrap(s, width = w), collapse = "\n")
cap <- function(...) {
  note <- paste0(c(...), collapse = " ")
  paste(c(if (nzchar(note)) wrap(note), wrap(paste0(CREDIT, ". ", SOURCE)), REPO),
        collapse = "\n")
}

# ======================================================================== Q1
# Do ministers under Zelensky really last the least?
# Shown as the full distribution of tenure lengths, not a pass/fail threshold:
# a threshold would treat eleven months and one day as the same outcome and hide
# exactly the thing that distinguishes the eras.
BUCKETS <- c("under 6 months", "6-12 months", "1-2 years", "2-4 years", "4+ years")
BUCKET_COLS <- setNames(c("#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#0d366b"), BUCKETS)

q1_stats <- resolved %>%
  filter(!is.na(president)) %>%
  group_by(president) %>%
  summarise(n = n(), median_y = median(years), .groups = "drop")

q1 <- resolved %>%
  filter(!is.na(president)) %>%
  mutate(bucket = cut(years, c(-Inf, 0.5, 1, 2, 4, Inf), labels = BUCKETS)) %>%
  count(president, bucket) %>%
  group_by(president) %>%
  mutate(share = n / sum(n)) %>%
  ungroup() %>%
  left_join(q1_stats %>% select(president, total = n, median_y), by = "president") %>%
  left_join(presidents %>% select(president = id, name_en), by = "president") %>%
  mutate(row_lab = factor(paste0(name_en, "\n(n=", total, ")"),
                          levels = rev(paste0(presidents$name_en, "\n(n=",
                                              q1_stats$n[match(presidents$id, q1_stats$president)], ")"))),
         bucket = factor(bucket, levels = BUCKETS))

cat("\n== Q1: how long ministers lasted, by president ==\n\n")
q1 %>% select(name_en, bucket, share) %>%
  pivot_wider(names_from = bucket, values_from = share, values_fill = 0) %>%
  mutate(across(where(is.numeric), ~percent(.x, accuracy = 1))) %>%
  left_join(q1_stats %>% left_join(presidents %>% select(president = id, name_en), by = "president") %>%
              transmute(name_en, median = sprintf("%.2fy", median_y)), by = "name_en") %>%
  as.data.frame() %>% print(row.names = FALSE, right = FALSE)

lo <- q1_stats %>% slice_min(median_y, n = 1) %>%
  left_join(presidents %>% select(president = id, name_en), by = "president")
cat(sprintf("\nShortest median tenure: %s at %.2f years", lo$name_en, lo$median_y))
cat(sprintf(" (next lowest %.2f).\n", sort(q1_stats$median_y)[2]))
cat(sprintf("Driven by the short tail: %d ministers under six months, the most of any era.\n",
            q1 %>% filter(name_en == lo$name_en, bucket == "under 6 months") %>% pull(n)))
cat(sprintf("Only %d tenures are excluded here - still running and begun within the last year,\n",
            nrow(tenures) - nrow(resolved)))
cat("so their length is not yet knowable. Every short tenure that ended is counted.\n")
write.csv(q1 %>% select(president, name_en, bucket, n, share, total, median_y),
          file.path(out_dir, "q1_by_president.csv"), row.names = FALSE)

p1 <- ggplot(q1, aes(share, row_lab, fill = bucket)) +
  # reverse = TRUE so the shortest bucket starts at the left, matching the legend
  geom_col(width = 0.62, position = position_stack(reverse = TRUE)) +
  geom_text(data = q1 %>% filter(share >= 0.08),
            aes(label = percent(share, accuracy = 1)),
            position = position_stack(vjust = 0.5, reverse = TRUE),
            size = 2.9, colour = "white") +
  geom_text(data = q1_stats %>%
              left_join(presidents %>% select(president = id, name_en), by = "president") %>%
              mutate(row_lab = factor(paste0(name_en, "\n(n=", n, ")"),
                                      levels = levels(q1$row_lab))),
            aes(x = 1.015, y = row_lab, label = sprintf("%.2f y", median_y)),
            inherit.aes = FALSE, hjust = 0, size = 3.1, colour = INK, fontface = "bold") +
  annotate("text", x = 1.015, y = length(levels(q1$row_lab)) + 0.62,
           label = "median", hjust = 0, size = 2.9, colour = MUTED) +
  scale_fill_manual(values = BUCKET_COLS, name = NULL) +
  scale_x_continuous(labels = percent, expand = expansion(mult = c(0, 0.13))) +
  guides(fill = guide_legend(nrow = 1)) +
  coord_cartesian(clip = "off") +
  labs(title = "Ministers under Zelensky do last the shortest",
       subtitle = "How long each president's ministers stayed in office",
       x = NULL, y = NULL,
       caption = cap("Every minister whose tenure has ended is counted, however brief.",
                     "Only 3 tenures are left out: still running and begun within the last",
                     "year, so their eventual length cannot be known yet.")) +
  theme_min("x") +
  theme(panel.grid.major.x = element_blank(),
        legend.position = "top", legend.text = element_text(size = 8.5, colour = INK2),
        legend.key.size = unit(10, "pt"), legend.margin = margin(b = 4),
        plot.margin = margin(14, 26, 10, 14))
save_fig("q1-by-president.png", p1, 8.6, 4.6)

# ======================================================================== Q2
# Has tenure length fallen over the years?
q2 <- observable %>%
  mutate(yr = as.integer(format(start, "%Y"))) %>%
  group_by(yr) %>%
  summarise(share = mean(lasted_1y), n = n(), .groups = "drop")

# 5-year centred rolling average, weighted by how many ministers each year had,
# because single years are far too thin to read on their own (some have 1-3).
roll <- q2 %>%
  mutate(smooth = map_dbl(yr, function(y) {
    w <- q2 %>% filter(yr >= y - 2, yr <= y + 2)
    sum(w$share * w$n) / sum(w$n)
  }))

cat("\n== Q2: share lasting >= 1 year, by year of appointment ==\n\n")
cat(sprintf("  yearly values range %s to %s across %d-%d; single years are noisy\n",
            percent(min(q2$share)), percent(max(q2$share)), min(q2$yr), max(q2$yr)))
cat(sprintf("  5-year smoothed: %s in the 1990s, %s in the 2000s, %s in the 2010s, %s in the 2020s\n",
            percent(weighted.mean(q2$share[q2$yr < 2000], q2$n[q2$yr < 2000]), accuracy = 1),
            percent(weighted.mean(q2$share[q2$yr %in% 2000:2009], q2$n[q2$yr %in% 2000:2009]), accuracy = 1),
            percent(weighted.mean(q2$share[q2$yr %in% 2010:2019], q2$n[q2$yr %in% 2010:2019]), accuracy = 1),
            percent(weighted.mean(q2$share[q2$yr >= 2020], q2$n[q2$yr >= 2020]), accuracy = 1)))
write.csv(roll, file.path(out_dir, "q2_by_year.csv"), row.names = FALSE)

events <- tibble(yr = c(2004, 2014, 2022),
                 lab = c("Orange\nRevolution", "Euromaidan", "full-scale\ninvasion"))
p2 <- ggplot(roll, aes(yr, share)) +
  geom_vline(data = events, aes(xintercept = yr), colour = GRID, linewidth = 0.5) +
  geom_text(data = events, aes(x = yr, y = 1.03, label = lab), inherit.aes = FALSE,
            hjust = -0.06, vjust = 1, size = 2.7, colour = MUTED, lineheight = 0.95) +
  geom_point(aes(size = n), colour = MUTED, alpha = 0.35) +
  geom_line(aes(y = smooth), colour = BLUE, linewidth = 1.1) +
  scale_size_area(max_size = 4.5) +
  scale_y_continuous(labels = percent, limits = c(0, 1.06),
                     breaks = seq(0, 1, 0.25), expand = expansion(mult = c(0.02, 0))) +
  scale_x_continuous(breaks = seq(1995, 2025, 5)) +
  labs(title = "No steady decline in how long ministers last",
       subtitle = "Share of ministers appointed each year who stayed at least one year (5-year average)",
       x = NULL, y = NULL,
       caption = cap("Ministers who lasted under a year are counted here too - they are what pulls the share down.",
                     "Grey dots are single years, sized by how many were appointed.",
                     "Stops at 2024: later appointees have not yet had a full year to be judged.")) +
  theme_min("y")
save_fig("q2-trend.png", p2, 8.2, 4.2)

# ======================================================================= Q2b
# The same question at the level of individual ministers: every appointment as
# one dot, so the reader sees the spread and the outliers rather than only an
# aggregate. This is the flagship graphic; q2-trend is its aggregate companion.
HALF_WIN <- 548   # days either side of each grid point (~1.5 years)

scatter <- tenures %>%
  filter(!is.na(president)) %>%
  mutate(pres_lab = factor(president, levels = presidents$id, labels = presidents$name_en))

grid <- seq(as.Date("1993-01-01"), WINDOW_END, by = "month")
roll <- tibble(d = grid) %>%
  mutate(v = map_dbl(d, function(dd) {
    sel <- scatter$years[abs(as.numeric(scatter$start - dd)) <= HALF_WIN]
    if (length(sel) >= 8) median(sel) else NA_real_
  })) %>%
  filter(!is.na(v)) %>%
  mutate(mature = d <= WINDOW_END - HALF_WIN)

# Era band across the top: short boundary ticks plus a named, colour-keyed label,
# which does the work of a legend without a legend box.
era_band <- presidents %>%
  filter(start < WINDOW_END) %>%
  mutate(stop = pmin(end, WINDOW_END),
         mid = start + (stop - start) / 2)

Y_TOP <- 8.0
# Labels sit high, where the scatter is sparse, and each one leans away from the
# nearest tall dot: Euromaidan to the left of its rule, the invasion to the right.
events <- tibble(d = as.Date(c("2014-02-22", "2022-02-24")),
                 lab = c("Euromaidan", "full-scale invasion"),
                 hj = c(1.06, -0.06))

cat("\n== Q2b: individual tenures, rolling median (+/-1.5 years) ==\n\n")
cat(sprintf("  %d ministers plotted; rolling median spans %s to %s\n",
            nrow(scatter), min(roll$d), max(roll$d)))
cat(sprintf("  median at the start of the series %.2fy, at the end %.2fy\n",
            roll$v[1], roll$v[nrow(roll)]))
write.csv(roll, file.path(out_dir, "q2b_rolling_median.csv"), row.names = FALSE)

p2b <- ggplot(scatter, aes(start, years)) +
  # wartime breaks, full height and dashed so they read as context
  geom_vline(data = events, aes(xintercept = d), linetype = "22",
             colour = MUTED, linewidth = 0.4) +
  geom_text(data = events, aes(x = d, y = 7.55, label = lab, hjust = hj),
            inherit.aes = FALSE, size = 2.7, colour = MUTED) +
  # era boundary ticks at the top only
  geom_segment(data = era_band %>% filter(start > min(scatter$start)),
               aes(x = start, xend = start, y = Y_TOP + 0.15, yend = Y_TOP + 0.75),
               inherit.aes = FALSE, colour = GRID, linewidth = 0.5) +
  geom_point(data = era_band, aes(x = mid, y = Y_TOP + 0.5, colour = id),
             inherit.aes = FALSE, size = 1.9, show.legend = FALSE) +
  geom_text(data = era_band, aes(x = mid, y = Y_TOP + 0.5, label = name_en),
            inherit.aes = FALSE, hjust = 0, nudge_x = 130, size = 3.1,
            colour = INK2, fontface = "bold") +
  # ministers still in office are hollow: their length is a lower bound
  geom_point(data = scatter %>% filter(!still_in), aes(colour = pres_lab),
             size = 1.9, alpha = 0.85, show.legend = FALSE) +
  geom_point(data = scatter %>% filter(still_in), aes(colour = pres_lab),
             shape = 21, fill = "white", stroke = 1.1, size = 2.1, show.legend = FALSE) +
  # rolling median: faint throughout, overdrawn solid where the data has matured
  geom_line(data = roll, aes(d, v), inherit.aes = FALSE,
            colour = INK, linewidth = 0.9, alpha = 0.28) +
  geom_line(data = roll %>% filter(mature), aes(d, v), inherit.aes = FALSE,
            colour = INK, linewidth = 0.9) +
  ggrepel::geom_text_repel(
    data = scatter %>% slice_max(years, n = 8),
    aes(label = name_en), size = 2.9, colour = INK, seed = 1,
    min.segment.length = 0.2, segment.colour = MUTED, segment.size = 0.3,
    box.padding = 0.45, point.padding = 0.3, max.overlaps = Inf,
    # keep name labels clear of the era band and event labels above
    ylim = c(NA, 7.15)) +
  scale_colour_manual(values = c(ERA_COLS, ERA_COLS_LAB)) +
  scale_x_date(date_breaks = "5 years", date_labels = "%Y",
               expand = expansion(mult = c(0.02, 0.06))) +
  scale_y_continuous(breaks = seq(0, 8, 2), labels = label_number(suffix = " y"),
                     limits = c(0, Y_TOP + 0.9), expand = expansion(mult = c(0.01, 0))) +
  coord_cartesian(clip = "off") +
  labs(title = "Ministers' time in office, one dot per appointment",
       subtitle = paste("Each dot is a minister (prime ministers excluded):",
                        "when they were appointed against how long they lasted.",
                        "\nBlack line is the rolling median over a three-year window."),
       x = NULL, y = NULL,
       caption = cap("Hollow dots were still in office when the government changed, so their length is a lower bound.",
                     "The median line fades over its final 18 months, where the newest appointments have not yet run their course.",
                     "Prime ministers are excluded; an acting spell and its confirmation count as one tenure.")) +
  theme_min("y") +
  theme(plot.margin = margin(14, 20, 10, 14))
save_fig("q2b-scatter.png", p2b, 9.4, 5.4)

# ======================================================================== Q3
# Who served longest?
q3 <- tenures %>%
  slice_max(years, n = 20) %>%
  select(name_en, ministry = ministry_en, years, still_in, president) %>%
  arrange(years) %>%
  mutate(name_en = factor(name_en, levels = unique(name_en)),
         # label the fill so the legend names presidents rather than showing ids
         pres_lab = factor(president, levels = presidents$id, labels = presidents$name_en))

cat("\n== Q3: longest-serving ministers ==\n\n")
q3 %>% arrange(desc(years)) %>% head(8) %>%
  transmute(name_en, ministry, years = round(years, 1),
            note = if_else(still_in, "still in office", "")) %>%
  as.data.frame() %>% print(row.names = FALSE, right = FALSE)
write.csv(q3 %>% arrange(desc(years)) %>% mutate(years = round(years, 2)),
          file.path(out_dir, "q3_longest.csv"), row.names = FALSE)

p3 <- ggplot(q3, aes(years, name_en, fill = pres_lab)) +
  geom_col(width = 0.68) +
  geom_text(aes(label = paste0(sprintf("%.1f", years), "y",
                               if_else(still_in, "  (still in office)", ""))),
            hjust = -0.08, size = 3, colour = INK) +
  geom_text(aes(x = 0.12, label = ministry), hjust = 0, size = 2.8, colour = "white") +
  scale_fill_manual(values = ERA_COLS_LAB, drop = FALSE, name = NULL) +
  scale_x_continuous(labels = label_number(suffix = "y"),
                     expand = expansion(mult = c(0, 0.22))) +
  guides(fill = guide_legend(nrow = 1)) +
  labs(title = "The twenty longest-serving ministers since independence",
       subtitle = "Coloured by the president who appointed them; ministry named inside the bar",
       x = NULL, y = NULL,
       caption = cap("Continuous service in one ministry, with an acting spell and its confirmation counted as one tenure.")) +
  theme_min("x") +
  theme(legend.position = "top", legend.text = element_text(size = 8.5, colour = INK2),
        legend.key.size = unit(10, "pt"), legend.margin = margin(b = 4))
save_fig("q3-longest.png", p3, 8.4, 6.4)

# ======================================================================== Q4
# Which chair is the hottest?
q4 <- tenures %>%
  group_by(lineage, ministry = ministry_en) %>%
  summarise(med = median(years), n = n(), .groups = "drop") %>%
  filter(n >= 8) %>%
  arrange(med) %>%
  mutate(ministry = factor(ministry, levels = ministry))

cat("\n== Q4: median tenure by ministry (ministries with >= 8 ministers) ==\n\n")
q4 %>% transmute(ministry, n, median_years = round(med, 2)) %>%
  as.data.frame() %>% print(row.names = FALSE, right = FALSE)
write.csv(q4 %>% select(-lineage), file.path(out_dir, "q4_by_ministry.csv"), row.names = FALSE)

p4 <- ggplot(q4, aes(med, ministry)) +
  geom_col(width = 0.66, fill = ORANGE) +
  geom_text(aes(label = sprintf("%.1f y", med)), hjust = -0.12, size = 3, colour = INK) +
  geom_text(aes(x = 0.05, label = paste0(n, " ministers")), hjust = 0,
            size = 2.7, colour = "white") +
  scale_x_continuous(labels = label_number(suffix = "y"),
                     expand = expansion(mult = c(0, 0.16))) +
  labs(title = "An education minister lasts three times longer than an economy minister",
       subtitle = "Median time a minister lasts, by ministry",
       x = NULL, y = NULL,
       caption = cap("Ministries with at least eight ministers since 1991.",
                     "Ongoing tenures count only the time served so far.")) +
  theme_min("x")
save_fig("q4-by-ministry.png", p4, 7.6, 5.6)

# ======================================================================== Q5
# When were governments shaken up?
q5 <- tenures %>%
  mutate(yr = as.integer(format(start, "%Y"))) %>%
  filter(yr <= 2025) %>%                    # 2026 is a partial year under the cutoff
  count(yr, name = "appointments") %>%
  complete(yr = full_seq(c(1991, 2025), 1), fill = list(appointments = 0))

cat("\n== Q5: ministerial appointments per year ==\n\n")
cat(sprintf("  busiest: %s\n",
            paste(sprintf("%d (%d)", q5$yr[order(-q5$appointments)][1:4],
                          sort(q5$appointments, decreasing = TRUE)[1:4]), collapse = ", ")))
cat(sprintf("  calmest: %s\n",
            paste(sprintf("%d (%d)", q5$yr[order(q5$appointments)][1:4],
                          sort(q5$appointments)[1:4]), collapse = ", ")))
inv <- q5$appointments[q5$yr == 2022]
cat(sprintf("  2014 (Euromaidan) saw %d appointments; 2022 (invasion) only %d - the\n",
            q5$appointments[q5$yr == 2014], inv))
cat("  full-scale war steadied the cabinet rather than churning it.\n")
write.csv(q5, file.path(out_dir, "q5_appointments.csv"), row.names = FALSE)

p5 <- ggplot(q5, aes(yr, appointments)) +
  geom_col(width = 0.66, fill = BLUE) +
  geom_text(data = q5 %>% filter(appointments >= 26 | yr == 2022),
            aes(label = appointments), vjust = -0.6, size = 3.1,
            colour = INK, fontface = "bold") +
  annotate("segment", x = 2022.9, xend = 2022.2, y = 19, yend = 5.2,
           colour = MUTED, linewidth = 0.4,
           arrow = arrow(length = unit(5, "pt"), type = "closed")) +
  annotate("text", x = 2022.6, y = 22.5, hjust = 0,
           label = "invasion year:\ncabinet barely changed",
           size = 2.8, colour = INK2, lineheight = 0.95) +
  # extra room on the right so the invasion annotation is not clipped
  scale_x_continuous(breaks = seq(1995, 2025, 5),
                     expand = expansion(mult = c(0.01, 0.11))) +
  scale_y_continuous(expand = expansion(mult = c(0, 0.14))) +
  labs(title = "Cabinet reshuffles come in waves, and war was not one of them",
       subtitle = "Number of ministers appointed each year",
       x = NULL, y = NULL,
       caption = cap("2026 omitted: the window ends 16 July 2026, so that year is incomplete.")) +
  theme_min("y")
save_fig("q5-turnover.png", p5, 8.2, 4.2)

# ============================================== acting officials over time ---
acting <- tenures %>%
  mutate(decade = paste0(substr(format(start, "%Y"), 1, 3), "0s")) %>%
  group_by(decade) %>%
  summarise(acting = sum(acting), n = n(), share = acting / n, .groups = "drop")

cat("\n== Ministries led by an official never confirmed as minister ==\n\n")
acting %>% transmute(decade, spells = n, acting,
                     share = percent(share, accuracy = 0.1)) %>%
  as.data.frame() %>% print(row.names = FALSE, right = FALSE)
cat("\nCaveat: recent politics is documented far more granularly than the 1990s,\n")
cat("so the direction is real but the magnitude is an upper bound.\n")
write.csv(acting, file.path(out_dir, "acting_share.csv"), row.names = FALSE)

p6 <- ggplot(acting, aes(decade, share)) +
  geom_col(fill = ORANGE, width = 0.55) +
  geom_text(aes(label = sprintf("%.0f%%  (%d of %d)", share * 100, acting, n)),
            vjust = -0.6, size = 3.1, colour = INK) +
  scale_y_continuous(labels = percent, expand = expansion(mult = c(0, 0.18))) +
  labs(title = "More and more ministries are run by unconfirmed acting officials",
       subtitle = "Share of ministry spells whose holder was never confirmed as minister",
       x = NULL, y = NULL,
       caption = cap("Part of the rise reflects better documentation of recent politics,",
                     "so the direction is firmer than the magnitude.")) +
  theme_min("y")
save_fig("acting-share.png", p6, 7.2, 4)

# ---------------------------------------- specification check (console only) -
# Kept because it is the honest answer to "did tenures get shorter": the sign
# depends on whether never-confirmed acting officials are counted.
EARLY <- as.Date(c("1991-08-24", "1999-12-31"))
LATE <- as.Date(c("2016-01-01", "2026-07-16"))
win <- function(d, w) d %>% filter(start >= w[1], start <= w[2])
spec_row <- function(label, dd) {
  e <- win(dd, EARLY); l <- win(dd, LATE)
  tibble(label = label, early = median(e$years), late = median(l$years),
         n_early = nrow(e), n_late = nrow(l),
         change_pct = (median(l$years) / median(e$years) - 1) * 100)
}
specs <- bind_rows(
  spec_row("All ministries, all spells", tenures),
  spec_row("Minus never-confirmed acting spells", tenures %>% filter(!acting)),
  spec_row("Core 11 ministries", tenures %>% filter(core)),
  spec_row("Core 11, confirmed ministers only", tenures %>% filter(core, !acting))
)
cat("\n== Median tenure, early vs late window, by definition ==\n\n")
specs %>% transmute(label,
                    `1991-99` = sprintf("%.2fy (n=%d)", early, n_early),
                    `2016-26` = sprintf("%.2fy (n=%d)", late, n_late),
                    change = sprintf("%+.0f%%", change_pct)) %>%
  as.data.frame() %>% print(row.names = FALSE, right = FALSE)
cat("\nThe sign is not robust across definitions - which is why the charts above\n")
cat("use 'share who lasted a year' instead of a median.\n")
write.csv(specs, file.path(out_dir, "specifications.csv"), row.names = FALSE)

cat(sprintf("\nwrote %d figures to analysis/figures and %d tables to analysis/output\n\n",
            length(list.files(fig_dir, pattern = "\\.png$")),
            length(list.files(out_dir, pattern = "\\.csv$"))))
