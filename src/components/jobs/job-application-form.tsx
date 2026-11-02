"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { applyToJob } from "@/features/jobs/actions";
import { Link } from "@/i18n/navigation";

const initialState = { status: "idle", message: "idle" } as const;

export function JobApplicationForm({
  jobId,
  contact,
}: {
  jobId: string;
  contact: { email: string | null; emailConfirmed: boolean } | null;
}) {
  const t = useTranslations("JobApplication");
  const [state, action, pending] = useActionState(applyToJob, initialState);

  // The application only shares a contact address when it is verified, and the
  // RPC refuses the whole submission otherwise. Naming that address — and
  // whether it is confirmed — turns a generic failure into something the
  // candidate can act on.
  const canShareContact = Boolean(contact?.email && contact.emailConfirmed);

  return (
    <section className="job-application-card" aria-labelledby="job-application-title">
      <h2 id="job-application-title">{t("title")}</h2>
      <p>{t("description")}</p>
      <form action={action} className="job-application-form">
        <input type="hidden" name="jobId" value={jobId} />
        <label htmlFor="job-cover-letter">{t("coverLetterLabel")}</label>
        <textarea
          id="job-cover-letter"
          name="coverLetter"
          rows={5}
          maxLength={5000}
          placeholder={t("coverLetterPlaceholder")}
        />
        <p className="job-application-hint">{t("coverLetterHint")}</p>
        {contact?.email ? (
          <p className="job-application-contact-address">
            {t("contactEmailLabel")}: <strong>{contact.email}</strong>{" "}
            {canShareContact ? null : (
              <span className="job-application-contact-warning">
                {t("contactEmailUnverifiedNote")}{" "}
                <Link href="/login">{t("verifyEmailAction")}</Link>
              </span>
            )}
          </p>
        ) : null}
        <label className="job-application-contact-consent">
          <input
            disabled={!canShareContact}
            name="shareContactEmail"
            type="checkbox"
          />
          <span>{t("shareContactEmail")}</span>
        </label>
        <button
          className="button button-primary"
          type="submit"
          disabled={pending || state.status === "success"}
        >
          {pending ? t("submitting") : t("submit")}
        </button>
      </form>
      {state.status !== "idle" ? (
        <p
          className={`job-application-message job-application-message--${state.status}`}
          role={state.status === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {t(`messages.${state.message}`)}
          {state.message === "unauthorized" ? (
            <>
              {" "}
              <Link href="/login">{t("loginAction")}</Link>
            </>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
