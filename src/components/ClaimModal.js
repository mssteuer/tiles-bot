'use client';

import { useState, useEffect } from 'react';
import { playSound } from '@/lib/sound';
import { useAccount, useWriteContract, useReadContract, useSwitchChain, usePublicClient } from 'wagmi';
import { useModal } from 'connectkit';
import { isAddress, parseUnits, formatUnits } from 'viem';
import { CONTRACT_ADDRESS, USDC_ADDRESS, MBH_ABI, ERC20_ABI, TARGET_CHAIN } from '@/lib/wagmi';
import { useCasperWallet } from '@/lib/casper-wallet';
import { useWalletSession } from '@/lib/useWalletSession';
import { buildTileClaimTransaction, buildWcsprApproveTransaction, csprToMotes, sendCasperTransaction } from '@/lib/casper-transactions';

function formatUsd(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '$0.0100';
  return `$${n.toFixed(4)}`;
}

function formatCspr(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '5.0000 CSPR';
  return `${n.toFixed(4)} CSPR`;
}

function explorerUrl(chain, hash, explorers) {
  if (!hash) return '';
  const base = explorers?.[chain];
  if (base) return `${base.explorer}${chain === 'casper' ? '/deploy/' : '/tx/'}${hash}`;
  // Fallback before /api/chains resolves.
  if (chain === 'casper') return `https://cspr.live/deploy/${hash}`;
  return `https://${TARGET_CHAIN.id === 84532 ? 'sepolia.' : ''}basescan.org/tx/${hash}`;
}

export default function ClaimModal({ tileId, onClose, onClaimed }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { setOpen: openConnectModal } = useModal();
  const { publicKey: casperPublicKey, truncatedKey: casperTruncatedKey, isConnected: isCasperConnected, signIn: openCasperWallet, getClickRef } = useCasperWallet();
  const { activeChain } = useWalletSession();

  const [selectedChain, setSelectedChain] = useState(null);
  const [step, setStep] = useState('select-chain');
  const [errorMsg, setErrorMsg] = useState('');
  const [txHash, setTxHash] = useState('');
  const [chainPrices, setChainPrices] = useState({ base: null, casper: null });
  const [chainExplorers, setChainExplorers] = useState(null);

  // Single-chain session: never offer a "choose Base or Casper" step inside
  // the claim modal itself. The chain choice happens once, at wallet-connect
  // time (WalletMenu). Once a session is active, jump straight into that
  // chain's flow. If no wallet is connected yet, prompt to connect (chain
  // choice lives in the header's Connect Wallet menu).
  useEffect(() => {
    if (activeChain && selectedChain !== activeChain) {
      setSelectedChain(activeChain);
      setStep(prev => (prev === 'select-chain' ? 'info' : prev));
    } else if (!activeChain && selectedChain) {
      setSelectedChain(null);
      setStep('select-chain');
    }
  }, [activeChain]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: onChainPrice } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: MBH_ABI,
    functionName: 'currentPrice',
    query: { enabled: !!CONTRACT_ADDRESS },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [address, CONTRACT_ADDRESS],
    query: { enabled: selectedChain === 'base' && !!address && !!CONTRACT_ADDRESS },
  });

  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address],
    query: { enabled: selectedChain === 'base' && !!address },
  });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/stats')
      .then(r => r.json())
      .then(stats => {
        if (cancelled) return;
        setChainPrices({
          base: stats?.perChain?.base?.currentPrice ?? stats?.currentPrice ?? null,
          casper: stats?.perChain?.casper?.currentPrice ?? null,
        });
      })
      .catch(() => {});
    fetch('/api/chains')
      .then(r => r.json())
      .then(data => { if (!cancelled) setChainExplorers(data?.chains || null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const basePrice = onChainPrice ? onChainPrice : parseUnits(String(chainPrices.base ?? 0.01), 6);
  const basePriceDisplay = formatUnits(basePrice, 6);
  const casperPriceDisplay = chainPrices.casper ?? 5;
  const hasAllowance = allowance !== undefined && allowance >= basePrice;
  const hasBalance = usdcBalance === undefined || usdcBalance >= basePrice;
  const hasBaseAddress = isConnected && isAddress(address || '');
  const hasBaseConfig = isAddress(CONTRACT_ADDRESS || '') && isAddress(USDC_ADDRESS || '');
  const wrongChain = selectedChain === 'base' && hasBaseAddress && chainId !== TARGET_CHAIN.id;
  const selectedPrice = selectedChain === 'casper'
    ? formatCspr(casperPriceDisplay)
    : `${formatUsd(basePriceDisplay)} USDC`;

  function extractError(e) {
    if (!e) return 'Unknown error';
    if (typeof e === 'string') return e;
    if (typeof e === 'object') {
      const msg = e.shortMessage || e.message || e.details || JSON.stringify(e);
      if (msg.includes('Address "undefined" is invalid') || msg.includes('Address undefined is invalid')) {
        return 'MetaMask did not return a valid Base account. Reconnect your Base wallet and try again.';
      }
      if (msg.includes('eth.merkle.io') || msg.includes('CORS') || msg.includes('Failed to fetch')) {
        return 'Base wallet/RPC connection failed. Reconnect MetaMask, make sure it is on Base, and try again.';
      }
      return msg;
    }
    return String(e);
  }

  function ensureBaseReady() {
    if (!hasBaseConfig) {
      setErrorMsg('Base claiming is temporarily misconfigured. The NFT contract or USDC address is missing.');
      setStep('error');
      return false;
    }
    if (!hasBaseAddress) {
      setErrorMsg('MetaMask did not return a valid Base account. Reconnect your Base wallet and try again.');
      setStep('error');
      return false;
    }
    return true;
  }

  async function registerBaseClaim(hash) {
    let lastMessage = 'Tile registration did not complete yet.';

    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1500 * attempt));
      const res = await fetch(`/api/tiles/${tileId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: address, txHash: hash, chain: selectedChain }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 202) {
        lastMessage = data.message || data.error || lastMessage;
        continue;
      }
      if (!res.ok) {
        throw new Error(data.error || data.detail || `Tile registration failed (${res.status})`);
      }
      return data;
    }

    throw new Error(`${lastMessage} The mint transaction is confirmed, but tiles.bot could not verify ownership yet. Wait a few seconds and try again.`);
  }

  async function handleApprove() {
    if (!ensureBaseReady()) return;
    setStep('approve');
    setErrorMsg('');
    try {
      const MAX_UINT = 2n ** 256n - 1n;
      const hash = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CONTRACT_ADDRESS, MAX_UINT],
      });
      setTxHash(hash);
      await new Promise(r => setTimeout(r, 2000));
      await refetchAllowance();
      setStep('info');
      await new Promise(r => setTimeout(r, 100));
      await handleClaim();
    } catch (e) {
      const msg = extractError(e);
      if (msg.includes('rejected') || msg.includes('denied') || msg.includes('cancel')) {
        setStep('info');
        return;
      }
      setErrorMsg(msg);
      setStep('error');
    }
  }

  async function handleClaim() {
    if (!ensureBaseReady()) return;
    setStep('claim');
    setErrorMsg('');
    try {
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: MBH_ABI,
        functionName: 'claim',
        args: [BigInt(tileId)],
      });
      setTxHash(hash);

      if (publicClient) await publicClient.waitForTransactionReceipt({ hash });

      await registerBaseClaim(hash);

      setStep('success');
      playSound('claim');
      if (onClaimed) onClaimed(tileId, address);
    } catch (e) {
      const msg = extractError(e);
      if (msg.includes('rejected') || msg.includes('denied') || msg.includes('cancel')) {
        setStep('info');
        return;
      }
      if (msg.includes('revert') || msg.includes('Tile already claimed')) setErrorMsg('This tile may already be claimed on-chain. Try a different tile.');
      else if (msg.includes('transfer failed') || msg.includes('USDC')) setErrorMsg('USDC transfer failed — check your USDC balance on Base and that the approval went through.');
      else setErrorMsg(msg);
      setStep('error');
    }
  }

  function ensureCasperReady() {
    if (!casperPublicKey) {
      setErrorMsg('Connect your Casper wallet before claiming.');
      setStep('error');
      return false;
    }
    if (!getClickRef?.()) {
      setErrorMsg('CSPR.click is not ready yet. Reconnect your Casper wallet and try again.');
      setStep('error');
      return false;
    }
    return true;
  }

  async function registerCasperClaim(deployHash) {
    let lastMessage = 'Casper ownership is not visible yet.';
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1500 * attempt));
      const res = await fetch(`/api/tiles/${tileId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: casperPublicKey, deployHash, txHash: deployHash, chain: 'casper' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 202) {
        lastMessage = data.message || data.error || lastMessage;
        continue;
      }
      if (!res.ok) throw new Error(data.error || data.detail || 'Casper registration failed');
      return data;
    }
    throw new Error(`${lastMessage} The Casper claim was sent, but tiles.bot could not verify ownership yet. Wait a few seconds and try again.`);
  }

  async function handleCasperClaim() {
    if (!ensureCasperReady()) return;
    const chainPayload = await fetch('/api/chains').then(r => r.json()).catch(() => null);
    const config = chainPayload?.chains?.casper;
    if (!config?.nftContract || !config?.paymentToken || !config?.rpcUrl) {
      setErrorMsg('Casper claiming is temporarily misconfigured. Missing NFT contract, wCSPR token, or RPC URL.');
      setStep('error');
      return;
    }

    const clickRef = getClickRef();
    const amountMotes = csprToMotes(casperPriceDisplay);
    setErrorMsg('');
    try {
      setStep('approve');
      const approveTx = await buildWcsprApproveTransaction({ publicKey: casperPublicKey, chainConfig: config, amountMotes });
      await sendCasperTransaction(clickRef, approveTx, casperPublicKey);

      setStep('claim');
      const claimTx = await buildTileClaimTransaction({ publicKey: casperPublicKey, chainConfig: config, tileId });
      const deployHash = await sendCasperTransaction(clickRef, claimTx, casperPublicKey, { onSent: setTxHash });
      if (deployHash) setTxHash(deployHash);
      await registerCasperClaim(deployHash);

      setStep('success');
      playSound('claim');
      if (onClaimed) onClaimed(tileId, casperPublicKey);
    } catch (e) {
      const msg = extractError(e);
      if (msg.includes('rejected') || msg.includes('denied') || msg.includes('cancel')) {
        setStep('info');
        return;
      }
      setErrorMsg(msg);
      setStep('error');
    }
  }

  function renderConnectPrompt() {
    return (
      <div className="text-center">
        <p className="mb-4 text-[14px] text-text-dim">Connect your wallet to claim this tile. Choose your chain from the wallet menu in the header.</p>
        <button onClick={() => openConnectModal(true)} className="btn-retro btn-retro-primary w-full px-3 py-3.5 text-[15px]">Connect your wallet</button>
      </div>
    );
  }

  function renderCasperFlow() {
    if (!isCasperConnected) {
      return (
        <div className="text-center">
          <p className="mb-4 text-[14px] text-text-dim">Connect your Casper wallet to claim this tile on Casper.</p>
          <button onClick={openCasperWallet} className="btn-retro btn-retro-casper w-full px-3 py-3.5 text-[15px]">Connect your Casper wallet</button>
          <p className="mt-3 text-[11px] text-text-gray">Casper uses wCSPR for payment. The grid IS the marketplace — no OpenSea detour.</p>
        </div>
      );
    }

    return (
      <div>
        <div className="mb-4 rounded-[2px] border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-[12px] text-text-dim">
          <div className="mb-1 font-semibold text-red-300">Casper flow</div>
          <ol className="ml-4 list-decimal space-y-1">
            <li>Approve wCSPR spending for this tile.</li>
            <li>Confirm the Casper <span className="font-mono">claim(token_id)</span> transaction.</li>
            <li>tiles.bot registers the tile after on-chain ownership is visible.</li>
          </ol>
        </div>
        <button onClick={handleCasperClaim} disabled={step === 'approve' || step === 'claim'} className={`btn-retro btn-retro-casper w-full px-3 py-3 text-[15px] ${(step === 'approve' || step === 'claim') ? 'btn-loading' : ''}`}>
          {(step === 'approve' || step === 'claim') && <span className="spinner spinner-amber" />}
          {step === 'approve' ? 'Approving wCSPR…' : step === 'claim' ? 'Claiming on Casper…' : `Approve + Claim on Casper (${formatCspr(casperPriceDisplay)})`}
        </button>
        <p className="mt-3 text-center text-[11px] text-text-gray">Connected Casper: {casperTruncatedKey}</p>
      </div>
    );
  }

  function renderBaseFlow() {
    if (!hasBaseAddress) {
      return (
        <div className="text-center">
          <p className={`mb-4 text-[14px] ${isConnected ? 'text-amber-500' : 'text-text-dim'}`}>
            {isConnected ? 'MetaMask is connected, but no valid Base account was returned. Reconnect your wallet.' : 'Connect your Base wallet to claim this tile with USDC.'}
          </p>
          <button onClick={() => openConnectModal(true)} className="btn-retro btn-retro-primary w-full px-3 py-3.5 text-[15px]">Connect your Base wallet</button>
        </div>
      );
    }

    if (!hasBaseConfig) {
      return (
        <div className="rounded-[2px] border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-accent-red">
          Base claiming is temporarily misconfigured. The NFT contract or USDC address is missing.
        </div>
      );
    }

    if (wrongChain) {
      return (
        <div className="text-center">
          <p className="mb-4 text-[14px] text-amber-500">Switch to {TARGET_CHAIN.name} to claim on Base.</p>
          <button onClick={() => switchChain({ chainId: TARGET_CHAIN.id })} className="btn-retro border-amber-500 px-6 py-2.5 text-amber-500">Switch Network</button>
        </div>
      );
    }

    return (
      <div>
        {!hasBalance && (
          <div className="mb-4 rounded-[2px] border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-accent-red">Insufficient USDC balance. You need ${parseFloat(basePriceDisplay).toFixed(4)} USDC on {TARGET_CHAIN.name}.</div>
        )}

        {!hasAllowance ? (
          <button onClick={handleApprove} disabled={!hasBalance || step === 'approve'} className={`btn-retro btn-retro-primary w-full px-3 py-3 text-[15px] ${step === 'approve' ? 'btn-loading' : ''} ${!hasBalance ? 'cursor-not-allowed opacity-50' : 'cursor-pointer opacity-100'}`}>
            {step === 'approve' && <span className="spinner" />}
            {step === 'approve' ? 'Approving USDC…' : '1. Approve USDC'}
          </button>
        ) : (
          <button onClick={handleClaim} disabled={!hasBalance || step === 'claim'} className={`btn-retro btn-retro-primary w-full px-3 py-3 text-[15px] ${step === 'claim' ? 'btn-loading' : ''} ${!hasBalance ? 'cursor-not-allowed opacity-50' : 'cursor-pointer opacity-100'}`}>
            {step === 'claim' && <span className="spinner" />}
            {step === 'claim' ? 'Claiming tile…' : `Claim on Base for ${formatUsd(basePriceDisplay)}`}
          </button>
        )}

        <p className="mt-3 text-center text-[11px] text-text-gray">Connected Base: {address?.slice(0, 6)}...{address?.slice(-4)}</p>
      </div>
    );
  }

  return (
    <div className="retro-modal-overlay" onClick={e => e.stopPropagation()}>
      <div className="retro-modal min-w-[360px] max-w-[480px] w-[90vw]">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="m-0 text-[20px] font-bold">Claim Tile #{tileId}</h2>
          <button onClick={onClose} className="cursor-pointer border-none bg-transparent px-1 text-[20px] text-text-gray">✕</button>
        </div>

        <div className="mb-5 rounded-[2px] border border-border bg-surface-2 px-4 py-3 text-[13px] text-text-dim">
          <div>Position: Row {Math.floor(tileId / 256)}, Col {tileId % 256}</div>
          {selectedChain ? (
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className={`text-[20px] font-bold ${selectedChain === 'casper' ? 'text-red-300' : 'text-accent-blue'}`}>{selectedPrice}</span>
            </div>
          ) : (
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-[20px] font-bold text-accent-blue">{formatUsd(basePriceDisplay)} USDC</span>
              <span className="text-[20px] font-bold text-red-300">{formatCspr(casperPriceDisplay)}</span>
            </div>
          )}
          {selectedChain && <div className="mt-0.5 text-[11px] text-text-gray">Claiming on {selectedChain === 'base' ? 'Base' : 'Casper'} — your active wallet session.</div>}
        </div>

        {step === 'select-chain' ? (
          renderConnectPrompt()
        ) : step === 'success' ? (
          <div className="text-center">
            <div className="mb-3 text-[48px]">🎉</div>
            <h3 className="mb-2 text-accent-green">Tile Claimed!</h3>
            <p className="text-[13px] text-text-dim">Tile #{tileId} is now yours on {selectedChain === 'casper' ? 'Casper' : 'Base'}.</p>
            {txHash && (
              <a href={explorerUrl(selectedChain, txHash, chainExplorers)} target="_blank" rel="noopener noreferrer" className="block text-[12px] text-accent-blue no-underline">
                View on {selectedChain === 'casper' ? 'cspr.live' : 'Basescan'} →
              </a>
            )}
            {selectedChain === 'base' && CONTRACT_ADDRESS && (
              <a href={`https://opensea.io/assets/base/${CONTRACT_ADDRESS}/${tileId}`} target="_blank" rel="noopener noreferrer" className="mt-1 block text-[12px] text-accent-blue no-underline">View on OpenSea →</a>
            )}
            {selectedChain === 'casper' && <p className="mt-2 text-[11px] text-text-gray">Casper has no external marketplace yet — the grid IS the marketplace.</p>}
            <button onClick={onClose} className="btn-retro btn-retro-primary mt-5 w-full px-6 py-2.5">Done</button>
          </div>
        ) : step === 'error' ? (
          <div>
            <p className="mb-4 text-[13px] text-accent-red">{errorMsg}</p>
            <button onClick={() => setStep('info')} className="btn-retro w-full px-6 py-2.5">Try Again</button>
          </div>
        ) : selectedChain === 'casper' ? (
          renderCasperFlow()
        ) : (
          renderBaseFlow()
        )}
      </div>
    </div>
  );
}
