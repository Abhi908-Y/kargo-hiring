import { describe, expect, it } from "vitest";
import { extractContact, redactCv } from "../src/lib/redact";
import { draftProblems, personalise, templateDraft, REJECTION_SENTENCE } from "../src/lib/drafting/draft";
import type { Candidate } from "../src/lib/types";

const CV = `PRIYA SHARMA
Mumbai, India | +91 98765 43210 | priya.sharma@gmail.com
linkedin.com/in/priyasharma | https://priya.dev/portfolio
Date of Birth: 12/03/1995
Gender: Female

Experience
Product Analyst, FreightCo (2019 - 2023)
- Built an Excel tracker for delayed shipments that 30 colleagues adopted.
- Priya led the carrier onboarding revamp; Sharma's SOP became standard.
- Worked on 1,20,000 shipments per month.`;

describe("contact extraction", () => {
  it("finds name, email and phone", () => {
    const c = extractContact(CV, "Priya_Sharma_CV.pdf");
    expect(c.fullName).toBe("Priya Sharma");
    expect(c.firstName).toBe("Priya");
    expect(c.email).toBe("priya.sharma@gmail.com");
    expect(c.phone?.replace(/\D/g, "")).toBe("919876543210");
  });

  it("falls back to the file name when the header has no name", () => {
    const c = extractContact("Summary\nProduct person with ops background.", "rohan-verma-resume.docx");
    expect(c.fullName).toBe("Rohan Verma");
  });
});

describe("redaction", () => {
  const contact = extractContact(CV, "Priya_Sharma_CV.pdf");
  const out = redactCv(CV, contact, "Priya_Sharma_CV.pdf");

  it("removes name, email, phone, links and personal lines", () => {
    expect(out).not.toMatch(/priya/i);
    expect(out).not.toMatch(/sharma/i);
    expect(out).not.toMatch(/@/);
    expect(out).not.toMatch(/98765/);
    expect(out).not.toMatch(/linkedin|priya\.dev|https?:/i);
    expect(out).not.toMatch(/1995|female/i);
  });

  it("keeps work evidence, location, dates and big numbers", () => {
    expect(out).toContain("Mumbai");
    expect(out).toContain("2019 - 2023");
    expect(out).toContain("30 colleagues adopted");
    expect(out).toContain("1,20,000 shipments");
    expect(out).toContain("FreightCo");
  });

  it("does not touch ordinary words that match a name case-insensitively", () => {
    const c = { fullName: "Will Mark", firstName: "Will", email: null, phone: null };
    const r = redactCv("Will Mark\nI will mark the release and will ship it.", c, "cv.pdf");
    expect(r).toContain("I will mark the release");
    expect(r).not.toContain("Will Mark");
  });
});

describe("email drafts", () => {
  const cand = { assigned_role: "PM", tagged_role: "PM", personal_line: "Your weekend tracker stood out to me." } as unknown as Candidate;

  it("fills in the real first name and calendar link", () => {
    const text = personalise("Hi [NAME],\nPick a slot: {calendar_link}", "Priya", "https://cal.com/arjun");
    expect(text).toBe("Hi Priya,\nPick a slot: https://cal.com/arjun");
    expect(personalise("Hi [NAME],", null, "x")).toBe("Hi there,");
  });

  it("standard drafts pass the safety checks", () => {
    expect(draftProblems(templateDraft(cand, "invite"), "invite")).toEqual([]);
    expect(draftProblems(templateDraft(cand, "rejection"), "rejection")).toEqual([]);
    expect(templateDraft(cand, "rejection").body).toContain(REJECTION_SENTENCE);
  });

  it("rejects unsafe AI drafts", () => {
    const ok = { subject: "Hi", body: `Hi [NAME],
${REJECTION_SENTENCE}`, interview_brief: "" };
    expect(draftProblems({ ...ok, body: "Hi Priya, " + REJECTION_SENTENCE }, "rejection")).toContain("no [NAME] placeholder");
    expect(draftProblems({ ...ok, body: ok.body + " [EMAIL]" }, "rejection")[0]).toMatch(/unexpected placeholder/);
    expect(draftProblems({ ...ok, body: ok.body + " {calendar_link}" }, "rejection")).toContain("rejection contains the calendar link");
    expect(draftProblems({ ...ok, body: "Hi [NAME], see you" }, "invite")).toContain("invite has no calendar link");
  });
});

describe("name detection edge cases", () => {
  it("never takes a school or company line as the name", () => {
    const c = extractContact("VELAMMAL MATRICULATION SCHOOL\nEducation\nB.E. 2019", "cv.pdf");
    expect(c.fullName).toBeNull();
  });

  it("prefers the file name when the header has no matching name", () => {
    const c = extractContact("Some Random Heading\nEDUCATION\nR.M.K College of Engineering", "16_shiva_kumar.pdf");
    expect(c.fullName).toBe("Shiva Kumar");
  });

  it("still uses a header name that matches the file name", () => {
    const c = extractContact("Priya Sharma\nProduct Manager", "priya_sharma_cv.pdf");
    expect(c.fullName).toBe("Priya Sharma");
  });
});
