import { redirect } from "next/navigation";


export default async function InboxDeepLink({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/app/inbox?id=${id}`);
}
