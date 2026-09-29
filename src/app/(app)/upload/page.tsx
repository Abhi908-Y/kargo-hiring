import { PageHeader } from "@/components/ui";
import { UploadClient } from "./UploadClient";

export const metadata = { title: "Upload · Kargo Hiring" };

export default function UploadPage() {
  return (
    <div>
      <PageHeader
        title="Upload CVs"
        subtitle="PDF or Word (.docx), up to 4 MB each. Pick the role each person applied for. Name, email, phone and links are removed before the AI sees anything."
      />
      <UploadClient />
    </div>
  );
}
