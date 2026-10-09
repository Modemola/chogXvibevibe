import { Featured, FinalCta, Formula, Hero, Pillars, Proof, StatsBand } from '@/components/home';
import { OnchainProof, ScoutTokenPanel } from '@/components/onchain';
import { Sieve } from '@/components/sieve';
import { onchainDrop, scoutToken, scoutTokenDrop } from '@/lib/onchain';
import { getService } from '@/lib/server';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const svc = await getService();
  const [stats, highlights, featuredId] = await Promise.all([svc.stats(), svc.highlights(), svc.featuredLaunch()]);
  const featured = featuredId ? await svc.aftermath(featuredId) : undefined;
  return (
    <>
      <Hero highlights={highlights} />
      <StatsBand stats={stats} />
      <Pillars />
      <Sieve />
      <Formula />
      <Proof />
      {onchainDrop && <OnchainProof drop={onchainDrop} />}
      <ScoutTokenPanel token={scoutToken} drop={scoutTokenDrop} />
      {featured && (
        <Featured
          data={{
            launch: { id: featured.launch.id, lane: featured.launch.lane, pairClass: featured.launch.pairClass },
            recipients: featured.recipients.length,
            windows: featured.windows,
          }}
        />
      )}
      <FinalCta />
    </>
  );
}
