import { PageHead } from '@/components/page-head';
import JoinFlow from './JoinFlow';

export const metadata = { title: 'Join · Graduation Scout' };

export default function JoinPage() {
  return (
    <>
      <PageHead
        kicker="Join Scout"
        title="One signature. *No gas.*"
        lead="Scout reads public on-chain activity of opted-in wallets and shows you exactly how your score is built. Link your alts so they count as one person, without a penalty."
      />
      <JoinFlow />
    </>
  );
}
