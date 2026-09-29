import { PageHeader } from "@/components/ui";
import { UploadClient } from "./UploadClient";

export const metadata = { title: "Upload · Kargo Hiring" };

export default function UploadPage() {
  return (
    <div>
      <PageHeader
        title="Upload CVs"
        subtitle="PDF or Word (.docx), up to 4 MB each. Contact details are removed before the AI sees anything."
      />
      <UploadClient />
    </div>
  );
}
