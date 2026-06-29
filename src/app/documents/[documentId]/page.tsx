import { AppShell } from "@/components/layout/AppShell";

type DocumentPageProps = {
  params: Promise<{
    documentId: string;
  }>;
};

export default async function DocumentPage({ params }: DocumentPageProps) {
  const { documentId } = await params;

  return <AppShell documentId={documentId} />;
}
