'use client';

import { useState, useEffect } from 'react';
import { playSound } from '@/lib/sound';
import { useAccount, useWriteContract, useReadContract, useSwitchChain, usePublicClient } from 'wagmi';
import { useModal } from 'connectkit';
import { parseUnits, formatUnits } from 'viem';
import { CONTRACT_ADDRESS, USDC_ADDRESS, MBH_ABI, ERC20_ABI, TARGET_CHAIN } from '@/lib/wagmi';

export default function ClaimModal({ tileId, onClose, onClaimed }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const { address, isConnected, chainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const { setOpen: openConnectModal } = useModal();

  const [step, setStep] = useState('info');
  const [errorMsg, setErrorMsg] = useState('');
  const [txHash, setTxHash] = useState('');

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
    query: { enabled: !!address && !!CONTRACT_ADDRESS },
  });

  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address],
    query: { enabled: !!address },
  });

  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const price = onChainPrice ? onChainPrice : parseUnits('0.01', 6);
  const priceDisplay = formatUnits(price, 6);
  const hasAllowance = allowance !== undefined && allowance >= price;
  const hasBalance = usdcBalance === undefined || usdcBalance >= price;
  const wrongChain = isConnected && chainId !== TARGET_CHAIN.id;

  function extractError(e) {
    if (!e) return 'Unknown error';
    if (typeof e === 'string') return e;
    if (typeof e === 'object') return e.shortMessage || e.message || e.details || JSON.stringify(e);
    return String(e);
  }

  async function handleApprove() {
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

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt > 0) await new Promise(r => setTimeout(r, 3000));
          const res = await fetch(`/api/tiles/${tileId}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: address, txHash: hash }),
          });
          if (res.ok || res.status === 200) break;
        } catch (_) {}
      }

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

  return (
    <div className="retro-modal-overlay" onClick={e => e.stopPropagation()}>
      <div className="retro-modal min-w-[360px] max-w-[440px] w-[90vw]">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="m-0 text-[20px] font-bold">Claim Tile #{tileId}</h2>
          <button onClick={onClose} className="cursor-pointer border-none bg-transparent px-1 text-[20px] text-text-gray">✕</button>
        </div>

        <div className="mb-5 rounded-[2px] border border-border bg-surface-2 px-4 py-3 text-[13px] text-text-dim">
          <div>Position: Row {Math.floor(tileId / 256)}, Col {tileId % 256}</div>
          <div className="mt-1 text-[20px] font-bold text-accent-blue">${parseFloat(priceDisplay).toFixed(4)} USDC</div>
          <div className="mt-0.5 text-[11px] text-text-gray">Bonding curve price — lower is earlier</div>
        </div>

        {!isConnected ? (
          <div className="text-center">
            <p className="mb-4 text-[14px] text-text-dim">Connect your wallet to claim this tile.</p>
            <button onClick={() => openConnectModal(true)} className="btn-retro btn-retro-primary w-full px-3 py-3.5 text-[15px]">Connect Wallet</button>
          </div>
        ) : wrongChain ? (
          <div className="text-center">
            <p className="mb-4 text-[14px] text-amber-500">Switch to {TARGET_CHAIN.name} to claim.</p>
            <button onClick={() => switchChain({ chainId: TARGET_CHAIN.id })} className="btn-retro border-amber-500 px-6 py-2.5 text-amber-500">Switch Network</button>
          </div>
        ) : step === 'success' ? (
          <div className="text-center">
            <div className="mb-3 text-[48px]">🎉</div>
            <h3 className="mb-2 text-accent-green">Tile Claimed!</h3>
            <p className="text-[13px] text-text-dim">Tile #{tileId} is now yours.</p>
            {txHash && (
              <a href={`https://${TARGET_CHAIN.id === 84532 ? 'sepolia.' : ''}basescan.org/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="text-[12px] text-accent-blue no-underline">View on Basescan →</a>
            )}
            <button onClick={onClose} className="btn-retro btn-retro-primary mt-5 w-full px-6 py-2.5">Done</button>
          </div>
        ) : step === 'error' ? (
          <div>
            <p className="mb-4 text-[13px] text-accent-red">{errorMsg}</p>
            <button onClick={() => setStep('info')} className="btn-retro w-full px-6 py-2.5">Try Again</button>
          </div>
        ) : (
          <div>
            {!hasBalance && (
              <div className="mb-4 rounded-[2px] border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-accent-red">Insufficient USDC balance. You need ${parseFloat(priceDisplay).toFixed(4)} USDC on {TARGET_CHAIN.name}.</div>
            )}

            {!hasAllowance ? (
              <button onClick={handleApprove} disabled={!hasBalance || step === 'approve'} className={`btn-retro btn-retro-primary w-full px-3 py-3 text-[15px] ${step === 'approve' ? 'btn-loading' : ''} ${!hasBalance ? 'cursor-not-allowed opacity-50' : 'cursor-pointer opacity-100'}`}>
                {step === 'approve' && <span className="spinner" />}
                {step === 'approve' ? 'Approving USDC…' : '1. Approve USDC'}
              </button>
            ) : (
              <button onClick={handleClaim} disabled={!hasBalance || step === 'claim'} className={`btn-retro btn-retro-primary w-full px-3 py-3 text-[15px] ${step === 'claim' ? 'btn-loading' : ''} ${!hasBalance ? 'cursor-not-allowed opacity-50' : 'cursor-pointer opacity-100'}`}>
                {step === 'claim' && <span className="spinner" />}
                {step === 'claim' ? 'Claiming tile…' : `Claim for $${parseFloat(priceDisplay).toFixed(4)}`}
              </button>
            )}

            <p className="mt-3 text-center text-[11px] text-text-gray">Connected: {address?.slice(0, 6)}...{address?.slice(-4)}</p>
          </div>
        )}
      </div>
    </div>
  );
}
