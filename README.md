# Rx Tools Max+

Offline pharmacy dispensing helpers, as an Android app and a web app.

Open the app to a home screen of tools, grouped and filterable by role (pharmacist, technician, assistant, trainee). Star the ones you use most.

| Group | Tools |
|---|---|
| **Dispensing** | Label generator · Quantity & days supply (with pack splitting) · Liquid dose (mg → mL, course volume, bottles) · Discard date after opening · Owing slip (patient + pharmacy copies) |
| **Checking** | Checklists (final accuracy check, POM and CD 2 & 3 legal requirements) · Look-alike sound-alike drugs · Short-dated stock check · Directions translator (“1 tds pc” → label wording) · Near-miss log with summary and CSV export · Prescription validity · Quantity in words |
| **Clinical** | Weight-based mg/kg dose with max cap · Creatinine clearance (Cockcroft–Gault with IBW, AdjBW, BMI) · Units & strengths (mg/mcg/g, mL/L, % w/v, 1 in N) |
| **Charts** | Prednisolone reducing chart · Sulfasalazine titration · Eye drop supply + drop chart · Patch & change-day schedule |
| **Study** | Calculations practice (10 topics, unlimited generated questions with worked answers, score and streak) · Revision flashcards (law, abbreviations, formulae, checking) |

No patient details are asked for or stored anywhere in the app.

Everything runs on the device — no internet connection and no data leaves the phone.

## Install on Android
Open the **[Releases](../../releases/latest)** page on your phone, download the `.apk` and open it. Each push to `main` builds a new release, and new versions install as updates over the old one.

## Use in a browser
Once GitHub Pages is on (Settings → Pages → Source: **GitHub Actions**), the app is at `https://digitaleye2k-lang.github.io/Rxtoolsplus/` and can be installed to the home screen.

## Project layout
```
web/        the app (HTML/CSS/JS, no build step, no CDN)
  js/logic.js   all dose calculations (pure functions)
  js/data.js    built-in label instructions — edit to add/change labels
android/    WebView wrapper that bundles web/ as assets (print, copy, file save)
tests/      node --test tests/logic.test.js
```

> For use by pharmacy professionals. Always check every output against the prescription before dispensing.
