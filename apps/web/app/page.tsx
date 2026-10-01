import { Featured, FinalCta, Formula, Hero, Pillars, Proof, Story, Ticker } from '@/components/home';
import { getService } from '@/lib/server';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const svc = await getService();
  const [stats, highlights, featuredId] = await Promise.all([svc.stats(), svc.highlights(), svc.featuredLaunch()]);
  const featured = featuredId ? await svc.aftermath(featuredId) : undefined;
  return (
    <>
      <Hero stats={stats} />
      <Ticker items={highlights} />
      <Pillars />
      <Story />
      <Formula />
      <Proof />
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
