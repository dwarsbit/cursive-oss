import { useState } from "react";
import { t } from "@scholarkit/i18n";
import { errorReportsOn, setErrorReports } from "@/lib/monitoring";

/** The desktop app's "Send error reports" setting. */
export function ErrorReportSettings() {
  const [on, setOn] = useState(errorReportsOn);
  return (
    <section className="mt-5" aria-labelledby="error-report-settings-title">
      <h2
        id="error-report-settings-title"
        className="mb-2 text-xs font-medium text-muted-foreground"
      >
        {t("Error reports")}
      </h2>
      <label className="flex items-start gap-2 text-[13px]">
        <input
          type="checkbox"
          className="mt-0.5 size-3.5 accent-[var(--tint)]"
          checked={on}
          onChange={(event) => {
            setOn(event.target.checked);
            void setErrorReports(event.target.checked);
          }}
        />
        <span>
          {t("Send error reports")}
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {t(
              "When something goes wrong, Cursive sends what failed and where in its code, so we can fix it. Never your text, file names or email address.",
            )}
          </span>
        </span>
      </label>
    </section>
  );
}
