import { describe, expect, it } from "vitest";
import { extractContact, redactCv } from "../src/lib/redact";
import { buildEmail, cleanPersonalLine } from "../src/lib/emails/templates";

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

describe("emails", () => {
  it("rejection has no reasons and uses the agreed sentence", () => {
    const e = buildEmail({ kind: "rejection", firstName: "Priya", role: "PM", calendarLink: "x", personalLine: "Your tracker was great." });
    expect(e.text).toContain("Unfortunately we're not able to take it forward at this stage.");
    expect(e.text).not.toContain("tracker");
    expect(e.text).toContain("Arjun Mehta");
  });

  it("shortlist includes calendar link and personal line", () => {
    const e = buildEmail({ kind: "shortlist", firstName: null, role: "SPM", calendarLink: "https://cal.com/arjun", personalLine: "Your exception dashboard stood out to me" });
    expect(e.text).toContain("Hi there,");
    expect(e.text).toContain("Senior Product Manager");
    expect(e.text).toContain("https://cal.com/arjun");
    expect(e.text).toContain("Your exception dashboard stood out to me.");
  });

  it("drops a personal line with placeholders or over 25 words", () => {
    expect(cleanPersonalLine("Your work at [NAME] was good")).toBeNull();
    expect(cleanPersonalLine(Array(30).fill("word").join(" "))).toBeNull();
  });
});
