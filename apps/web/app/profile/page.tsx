import { redirect } from 'next/navigation';

/** Target of the header lookup form. */
export default async function ProfileLookup({ searchParams }: { searchParams: Promise<{ wallet?: string }> }) {
  const { wallet } = await searchParams;
  redirect(wallet ? `/profile/${encodeURIComponent(wallet.trim())}` : '/');
}
