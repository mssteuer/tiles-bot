'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useModal } from 'connectkit';
import { playSound } from '@/lib/sound';
import { useAccount, useWriteContract, usePublicClient, useSwitchChain } from 'wagmi';
import { parseAbi } from 'viem';
import { TARGET_CHAIN } from '@/lib/wagmi';
import { useCasperWallet } from '@/lib/casper-wallet';

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const GRID_SIZE = 256;
const TOTAL_TILES = 65536;

const USDC_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
]);

const CONTRACT_ABI = parseAbi([
  'function batchClaim(uint256[] calldata tileIds) external',
  'function currentPrice() view returns (uint256)',
]);

const CHAIN_OPTIONS = [
  {
    id: 'base',
    name: 'Base',
    badge: '🔵',
    token: 'USDC',
    tone: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
    description: 'Batch mint ERC-721 tiles with USDC. OpenSea support after claim.',
  },
  {
    id: 'casper',
    name: 'Casper',
    badge: '🔴',
    token: 'CSPR',
    tone: 'border-red-500/40 bg-red-500/10 text-red-300',
    description: 'Batch mint CEP-95 tiles with wCSPR. The grid IS the marketplace.',
  },
];

function detectRectangle(tileIds) {
  if (!tileIds || tileIds.length < 2) return null;
  const sorted = [...tileIds].sort((a, b) => a - b);
  const rows = sorted.map((id) => Math.floor(id / GRID_SIZE));
  const cols = sorted.map((id) => id % GRID_SIZE);
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);
  const width = maxCol - minCol + 1;
  const height = maxRow - minRow + 1;
  if (width * height !== sorted.length) return null;

  const expected = [];
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      expected.push(row * GRID_SIZE + col);
    }
  }
  if (expected.some((id, index) => id !== sorted[index])) return null;
  return {
    topLeftId: minRow * GRID_SIZE + minCol,
    width,
    height,
    tileIds: expected,
  };
}

function bondingPrice(totalMinted) {
  return Math.exp(Math.log(11111) * totalMinted / TOTAL_TILES) / 100;
}

function batchEstimate(totalMinted, count) {
  let total = 0;
  for (let i = 0; i < count; i++) total += bondingPrice(totalMinted + i);
  return total;
}

function formatUsd(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '$0.0100';
  return `$${n.toFixed(4)}`;
}

function formatCspr(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0.0100 CSPR';
  return `${n.toFixed(4)} CSPR`;
}

function explorerUrl(chain, hash) {
  if (!hash) return '';
  if (chain === 'casper') return `https://cspr.live/deploy/${hash}`;
  return `https://${TARGET_CHAIN.id === 84532 ? 'sepolia.' : ''}basescan.org/tx/${hash}`;
}

const MAX_BATCH_TILES = 256; // 16×16 max span

export default function BatchClaimModal({ tileIds, tiles, onClose, onClaimed, onSpanClaimRequest }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const [step, setStep] = useState('select-chain');
  const [selectedChain, setSelectedChain] = useState(null);
  const [error, setError] = useState(null);
  const [claimedCount, setClaimedCount] = useState(0);
  const [claimTxHash, setClaimTxHash] = useState('');
  const [casperDeployHash, setCasperDeployHash] = useState('');
  const [chainStats, setChainStats] = useState({
    base: { currentPrice: 0.01, claimed: 0 },
    casper: { currentPrice: 0.01, claimed: 0 },
  });
  const frozenTiles = useRef(null);
  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { setOpen: openConnectModal } = useModal();
  const { publicKey: casperPublicKey, truncatedKey: casperTruncatedKey, isConnected: isCasperConnected, signIn: openCasperWallet } = useCasperWallet();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const { unclaimed, alreadyClaimed, wasCapped } = useMemo(() => {
    if (frozenTiles.current) return frozenTiles.current;
    const unclaimed = [];
    const alreadyClaimed = [];
    for (const id of tileIds) {
      const t = tiles[id];
      if (t && t.owner) alreadyClaimed.push(id);
      else unclaimed.push(id);
    }
    const wasCapped = unclaimed.length > MAX_BATCH_TILES;
    return { unclaimed: unclaimed.slice(0, MAX_BATCH_TILES), alreadyClaimed, wasCapped };
  }, [tileIds, tiles]);

  const claimedRectangle = useMemo(() => detectRectangle(unclaimed), [unclaimed]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/stats')
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        setChainStats({
          base: {
            currentPrice: d?.perChain?.base?.currentPrice ?? d?.currentPrice ?? 0.01,
            claimed: d?.perChain?.base?.claimed ?? d?.claimed ?? 0,
          },
          casper: {
            currentPrice: d?.perChain?.casper?.currentPrice ?? 0.01,
            claimed: d?.perChain?.casper?.claimed ?? 0,
          },
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const estimates = useMemo(() => ({
    base: {
      perTilePrice: Number(chainStats.base.currentPrice).toFixed(4),
      estimatedTotal: batchEstimate(chainStats.base.claimed, unclaimed.length).toFixed(4),
    },
    casper: {
      perTilePrice: Number(chainStats.casper.currentPrice).toFixed(4),
      estimatedTotal: batchEstimate(chainStats.casper.claimed, unclaimed.length).toFixed(4),
    },
  }), [chainStats, unclaimed.length]);

  const selectedEstimate = selectedChain === 'casper' ? estimates.casper : estimates.base;
  const wrongChain = selectedChain === 'base' && isConnected && chainId !== TARGET_CHAIN.id;

  const handleBatchClaim = async () => {
    if (!isConnected || unclaimed.length === 0 || selectedChain !== 'base') return;

    try {
      frozenTiles.current = { unclaimed: [...unclaimed], alreadyClaimed: [...alreadyClaimed], wasCapped };
      setClaimedCount(unclaimed.length);
      setStep('approve');
      setError(null);

      const approveAmount = BigInt(Math.ceil(Number(selectedEstimate.estimatedTotal) * 1.5 * 1e6));
      await writeContractAsync({
        address: USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'approve',
        args: [CONTRACT_ADDRESS, approveAmount],
      });

      setStep('claim');

      const claimTx = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'batchClaim',
        args: [unclaimed.map(id => BigInt(id))],
      });
      setClaimTxHash(claimTx);

      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: claimTx });
      }

      try {
        await fetch('/api/tiles/batch-register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: address, tileIds: unclaimed, txHash: claimTx, chain: selectedChain }),
        });
      } catch {}

      setStep('success');
      playSound('batch-claim');
      if (onClaimed) onClaimed(unclaimed);
    } catch (err) {
      const msg = err?.shortMessage || err?.message || 'Transaction failed';
      if (msg.toLowerCase().includes('reject') || msg.toLowerCase().includes('denied')) {
        frozenTiles.current = null;
        setStep('preview');
        return;
      }
      setError(msg);
      setStep('error');
    }
  };

  async function handleRegisterCasperBatch() {
    const deployHash = casperDeployHash.trim();
    if (!deployHash) {
      setError('Paste the Casper deploy hash after batch minting on-chain.');
      setStep('error');
      return;
    }

    try {
      frozenTiles.current = { unclaimed: [...unclaimed], alreadyClaimed: [...alreadyClaimed], wasCapped };
      setClaimedCount(unclaimed.length);
      setStep('claim');
      setError(null);
      const res = await fetch('/api/tiles/batch-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: casperPublicKey, tileIds: unclaimed, deployHash, txHash: deployHash, chain: selectedChain }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || data.detail || 'Casper batch registration failed');
      setClaimTxHash(deployHash);
      setStep('success');
      playSound('batch-claim');
      if (onClaimed) onClaimed(unclaimed);
    } catch (err) {
      setError(err?.message || 'Casper batch registration failed');
      setStep('error');
    }
  }

  const gridCols = Math.min(unclaimed.length, 8);

  function chooseChain(chain) {
    setSelectedChain(chain);
    setError(null);
    setClaimTxHash('');
    setStep('preview');
  }

  function renderChainSelector() {
    return (
      <div>
        <div className="mb-3 text-[14px] font-semibold text-text">Choose your chain</div>
        <div className="grid gap-3 sm:grid-cols-2">
          {CHAIN_OPTIONS.map(chain => {
            const estimate = chain.id === 'casper' ? estimates.casper : estimates.base;
            const total = chain.id === 'casper' ? formatCspr(estimate.estimatedTotal) : `${formatUsd(estimate.estimatedTotal)} USDC`;
            return (
              <button
                key={chain.id}
                onClick={() => chooseChain(chain.id)}
                className={`cursor-pointer rounded-[3px] border px-3 py-3 text-left transition hover:-translate-y-0.5 ${chain.tone}`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[16px] font-bold">{chain.badge} {chain.name}</span>
                  <span className="font-mono text-[13px]">{total}</span>
                </div>
                <div className="text-[12px] leading-snug text-text-dim">{chain.description}</div>
              </button>
            );
          })}
        </div>
        <div className="mt-3 text-[11px] text-text-gray">Independent bonding curves: Base totals are USD/USDC, Casper totals are CSPR.</div>
      </div>
    );
  }

  function renderBaseFlow() {
    if (!isConnected) {
      return (
        <div className="text-center text-[14px] text-text-dim">
          <p className="mb-4">Connect your Base wallet to batch claim these tiles with USDC.</p>
          <button onClick={() => openConnectModal(true)} className="btn-retro btn-retro-primary w-full px-3 py-3.5 text-[15px]">Connect your Base wallet</button>
        </div>
      );
    }

    if (wrongChain) {
      return (
        <div className="text-center">
          <p className="mb-4 text-[14px] text-amber-500">Switch to {TARGET_CHAIN.name} to batch claim on Base.</p>
          <button onClick={() => switchChain({ chainId: TARGET_CHAIN.id })} className="btn-retro border-amber-500 px-6 py-2.5 text-amber-500">Switch Network</button>
        </div>
      );
    }

    return (
      <button onClick={handleBatchClaim} className="btn-retro btn-retro-primary w-full px-0 py-3.5 text-[16px]">
        Claim {unclaimed.length} Tile{unclaimed.length !== 1 ? 's' : ''} on Base ({formatUsd(selectedEstimate.estimatedTotal)} USDC)
      </button>
    );
  }

  function renderCasperFlow() {
    if (!isCasperConnected) {
      return (
        <div className="text-center text-[14px] text-text-dim">
          <p className="mb-4">Connect your Casper wallet to batch claim these tiles with wCSPR.</p>
          <button onClick={openCasperWallet} className="btn-retro btn-retro-casper w-full px-3 py-3.5 text-[15px]">Connect your Casper wallet</button>
          <p className="mt-3 text-[11px] text-text-gray">Casper has no external marketplace yet — the grid IS the marketplace.</p>
        </div>
      );
    }

    return (
      <div>
        <div className="mb-4 rounded-[2px] border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-[12px] text-text-dim">
          <div className="mb-1 font-semibold text-red-300">Casper batch flow</div>
          <ol className="ml-4 list-decimal space-y-1">
            <li>Approve wCSPR for the total batch price.</li>
            <li>Mint with <span className="font-mono">batch_claim(token_ids)</span> from your Casper wallet or agent flow.</li>
            <li>Paste the deploy hash here so tiles.bot verifies the batch and registers the tiles.</li>
          </ol>
        </div>
        <input
          value={casperDeployHash}
          onChange={e => setCasperDeployHash(e.target.value)}
          placeholder="Casper deploy hash"
          className="mb-3 w-full rounded-[2px] border border-border bg-surface-2 px-3 py-2.5 font-mono text-[12px] text-text outline-none"
        />
        <button onClick={handleRegisterCasperBatch} className="btn-retro btn-retro-casper w-full px-0 py-3.5 text-[16px]">
          Register Casper batch ({formatCspr(selectedEstimate.estimatedTotal)})
        </button>
        <p className="mt-3 text-center text-[11px] text-text-gray">Connected Casper: {casperTruncatedKey}</p>
      </div>
    );
  }

  return (
    <div className="retro-modal-overlay" onClick={e => e.stopPropagation()}>
      <div className="retro-modal w-[95%] max-w-[540px]" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="m-0 text-[20px]">Batch Claim — {unclaimed.length} Tile{unclaimed.length !== 1 ? 's' : ''}</h2>
          <button onClick={onClose} className="cursor-pointer border-none bg-transparent px-1 text-[24px] text-text-dim">×</button>
        </div>

        {alreadyClaimed.length > 0 && (
          <div className="mb-3 rounded-[2px] border border-amber-500/30 bg-amber-500/10 px-2.5 py-2.5 text-[13px]">
            ⚠️ {alreadyClaimed.length} tile{alreadyClaimed.length !== 1 ? 's' : ''} already claimed — skipping
          </div>
        )}

        <div className="mb-4 grid max-h-[200px] gap-1 overflow-y-auto" style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}>
          {unclaimed.slice(0, 64).map(id => (
            <div key={id} className="rounded-[2px] border border-blue-500/30 bg-surface-2 p-1 text-center text-[10px] text-text-dim">
              #{id}
            </div>
          ))}
          {unclaimed.length > 64 && (
            <div className="p-1 text-[11px] text-text-light">+{unclaimed.length - 64} more</div>
          )}
        </div>

        {wasCapped && (
          <div className="mb-3 rounded-[2px] border border-red-500/30 bg-red-500/10 px-2.5 py-2.5 text-[13px] text-red-400">
            ⚠️ Selection capped to {MAX_BATCH_TILES} tiles (max {Math.sqrt(MAX_BATCH_TILES)}×{Math.sqrt(MAX_BATCH_TILES)} span). Select fewer tiles.
          </div>
        )}

        <div className="mb-4 rounded-[2px] border border-border bg-surface px-3 py-3">
          <div className="mb-1.5 flex justify-between text-[13px] text-text-dim">
            <span>Base starting price:</span>
            <span className="font-mono">{formatUsd(estimates.base.perTilePrice)} USDC</span>
          </div>
          <div className="mb-1.5 flex justify-between text-[13px] text-text-dim">
            <span>Casper starting price:</span>
            <span className="font-mono">{formatCspr(estimates.casper.perTilePrice)}</span>
          </div>
          <div className="flex justify-between text-[16px] font-semibold text-text">
            <span>{selectedChain === 'casper' ? 'Casper' : selectedChain === 'base' ? 'Base' : 'Estimated'} total ({unclaimed.length} tiles):</span>
            <span className="font-mono">
              {selectedChain === 'casper'
                ? formatCspr(selectedEstimate.estimatedTotal)
                : `${formatUsd(selectedEstimate.estimatedTotal)} USDC`}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-text-light">
            Price increases per tile along each chain's independent bonding curve
          </div>
        </div>

        {step !== 'select-chain' && step !== 'success' && (
          <button onClick={() => { setSelectedChain(null); setStep('select-chain'); setError(null); }} className="mb-4 border-none bg-transparent p-0 text-[12px] text-accent-blue underline-offset-2 hover:underline">
            ← Back to chain choice
          </button>
        )}

        {step === 'success' && claimedRectangle && onSpanClaimRequest && (
          <div className="mb-4 rounded-[2px] border border-sky-500/35 bg-sky-500/12 px-3 py-3">
            <div className="mb-1 text-[14px] font-semibold">These claimed tiles form a rectangle.</div>
            <div className="mb-2.5 text-[12px] text-text-dim">
              {claimedRectangle.width}×{claimedRectangle.height} starting at tile #{claimedRectangle.topLeftId}
            </div>
            <button onClick={() => { onSpanClaimRequest(claimedRectangle.topLeftId, claimedRectangle.tileIds); onClose(); }}
              className="btn-retro btn-retro-primary px-3.5 py-2.5">
              🧩 Upload Spanning Image
            </button>
          </div>
        )}

        {step === 'select-chain' && renderChainSelector()}

        {step === 'preview' && (
          selectedChain === 'casper' ? renderCasperFlow() : renderBaseFlow()
        )}

        {step === 'approve' && (
          <div className="btn-loading rounded-[2px] border border-amber-500/30 bg-amber-500/10 px-0 py-3.5 text-center text-[14px] text-amber-500">
            <span className="spinner spinner-amber" />
            Approving USDC — confirm in Base wallet…
          </div>
        )}

        {step === 'claim' && (
          <div className="btn-loading rounded-[2px] border border-blue-500/30 bg-blue-500/10 px-0 py-3.5 text-center text-[14px] text-accent-blue">
            <span className="spinner spinner-blue" />
            {selectedChain === 'casper' ? 'Verifying Casper deploy…' : `Claiming ${unclaimed.length} tiles — confirm in Base wallet…`}
          </div>
        )}

        {step === 'success' && (
          <div className="text-center">
            <div className="mb-2 text-[40px]">🎉</div>
            <div className="text-[16px] font-semibold text-accent-green">{claimedCount} tiles claimed on {selectedChain === 'casper' ? 'Casper' : 'Base'}!</div>
            {claimTxHash && (
              <a href={explorerUrl(selectedChain, claimTxHash)} target="_blank" rel="noopener noreferrer" className="mt-2 block text-[12px] text-accent-blue no-underline">
                View on {selectedChain === 'casper' ? 'cspr.live' : 'Basescan'} →
              </a>
            )}
            {selectedChain === 'base' && CONTRACT_ADDRESS && unclaimed.length > 0 && (
              <a href={`https://opensea.io/assets/base/${CONTRACT_ADDRESS}/${unclaimed[0]}`} target="_blank" rel="noopener noreferrer" className="mt-1 block text-[12px] text-accent-blue no-underline">View first tile on OpenSea →</a>
            )}
            {selectedChain === 'casper' && <p className="mt-2 text-[11px] text-text-gray">Casper has no external marketplace yet — the grid IS the marketplace.</p>}
            <button onClick={onClose} className="btn-retro btn-retro-green mt-3 px-6 py-2.5">
              Done
            </button>
          </div>
        )}

        {step === 'error' && (
          <div className="text-center">
            <div className="mb-2 text-[14px] text-accent-red">{error}</div>
            <button onClick={() => setStep('preview')} className="btn-retro btn-retro-primary px-6 py-2.5">
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
