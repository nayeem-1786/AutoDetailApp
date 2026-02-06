import { redirect } from 'next/navigation';

interface Props {
  params: Promise<{ token: string }>;
}

export default async function ShortQuoteRedirect({ params }: Props) {
  const { token } = await params;
  redirect(`/quote/${token}`);
}
