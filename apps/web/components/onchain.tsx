'use client';

import { TEMPLATES, type TemplateId } from '@scout/core';
import Link from 'next/link';
import { short, tokens } from '@/lib/format';
import { type OnchainDrop, explorerAddress, explorerTx } from '@/lib/onchain';
import { Item, Reveal, Stagger, Words } from './motion';

const templateName = (id: string) => TEMPLATES[id as TemplateId]?.name ?? id;

function Ext({ href, children }: { href?: string; children: React.ReactNode }) {
  if (!href) return <span className="mono">{children}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="mono link">
      {children} ↗
    </a>
  );
}

/** Home-page proof that a Scout drop ran for real: the contract, the drop and every transaction. */
export function OnchainProof({ drop }: { drop: OnchainDrop }) {
  const steps: [string, string | undefined][] = [
    ['Deploy ScoutDrop', drop.txs.deployScoutDrop],
    ['Deploy launch token', drop.txs.deployToken],
    ['Approve the total', drop.txs.approve],
    ['Create the drop', drop.txs.createDrop],
    ...drop.txs.claims.map((h, i): [string, string] => [`Claims, batch ${i + 1} of ${drop.txs.claims.length}`, h]),
  ];
  return (
    <section className="section">
      <div className="split proof">
        <div>
          <Reveal>
            <div className="kicker">
              <span className="live-dot" /> On-chain
            </div>
          </Reveal>
          <Words as="h2" className="display" text={`Paid out on *${drop.chainName.replace(/ Testnet$/, '')}.*`} />
          <Reveal delay={0.15}>
            <p className="lead">
              Not a mock-up. Scout resolved <b>{templateName(drop.template)}</b> for{' '}
              <Link href={`/launches/${drop.launchId}`} className="link">
                {drop.launchId}
              </Link>
              , committed the policy hash and Merkle root on-chain, and a keeper pushed every claim. Each recipient holds their tokens
              now; check any of them on the explorer.
            </p>
          </Reveal>
          <Reveal delay={0.25}>
            <div className="grid cols-2" style={{ marginTop: 28 }}>
              <div className="glass pad r-xl stat">
                <div className="n text-iris">
                  {drop.claimed}
                  <span className="faint"> / {drop.recipients}</span>
                </div>
                <div className="l">recipients paid</div>
              </div>
              <div className="glass pad r-xl stat">
                <div className="n">{tokens(drop.total, 0)}</div>
                <div className="l">tokens distributed in drop #{drop.dropId}</div>
              </div>
            </div>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <div className="glass pad r-xl onchain-card">
            <div className="row between tiny faint mono" style={{ marginBottom: 14 }}>
              <span>{drop.chainName.toUpperCase()}</span>
              <span>CHAIN {drop.chainId}</span>
            </div>
            <dl className="onchain-facts">
              <dt>ScoutDrop</dt>
              <dd>
                <Ext href={explorerAddress(drop, drop.scoutDrop)}>{short(drop.scoutDrop)}</Ext>
              </dd>
              <dt>Token</dt>
              <dd>
                <Ext href={explorerAddress(drop, drop.token)}>{short(drop.token)}</Ext>
              </dd>
              <dt>Policy hash</dt>
              <dd className="mono">{short(drop.policyHash)}</dd>
              <dt>Merkle root</dt>
              <dd className="mono">{short(drop.merkleRoot)}</dd>
            </dl>
            <div className="tiny faint mono" style={{ margin: '18px 0 10px' }}>
              TRANSACTIONS
            </div>
            <Stagger className="stack onchain-txs" gap={0.05}>
              {steps
                .filter((s): s is [string, string] => Boolean(s[1]))
                .map(([label, hash]) => (
                  <Item key={hash}>
                    <div className="row between small">
                      <span>{label}</span>
                      <Ext href={explorerTx(drop, hash)}>{short(hash)}</Ext>
                    </div>
                  </Item>
                ))}
            </Stagger>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/** One-line badge for the launch whose drop ran on-chain. */
export function OnchainBadge({ drop }: { drop: OnchainDrop }) {
  return (
    <div className="notice ok onchain-badge">
      <span className="live-dot" /> This drop was paid out for real on {drop.chainName}: drop #{drop.dropId}, {drop.claimed} of {drop.recipients}{' '}
      recipients claimed.{' '}
      <Ext href={explorerAddress(drop, drop.scoutDrop)}>View the contract</Ext>
    </div>
  );
}
