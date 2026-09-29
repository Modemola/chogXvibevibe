import JoinFlow from './JoinFlow';

export const metadata = { title: 'Join · Graduation Scout' };

export default function JoinPage() {
  return (
    <>
      <h1>Opt in to Scout</h1>
      <p className="lead">
        One signature, no transaction, no gas. Scout reads public on-chain activity of opted-in wallets and shows you
        exactly how your score is built.
      </p>
      <JoinFlow />
    </>
  );
}
