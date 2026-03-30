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

  const [step, setStep] = useState('info'); // info | approve | claim | success | error
  const [errorMsg, setErrorMsg] = useState('');
  const [txHash, setTxHash] = useState('');

  // Read on-chain price
  const { data: onChainPrice } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: MBH_ABI,
    functionName: 'currentPrice',
    query: { enabled: !!CONTRACT_ADDRESS },
  });

  // Read USDC allowance
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [address, CONTRACT_ADDRESS],
    query: { enabled: !!address && !!CONTRACT_ADDRESS },
  });

  // Read USDC balance
  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address],
    query: { enabled: !!address },
  });

  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const price = onChainPrice ? onChainPrice : parseUnits('0.01', 6); // fallback $0.01
  const priceDisplay = formatUnits(price, 6);
  const hasAllowance = allowance !== undefined && allowance >= price;
  // Treat undefined (still loading) as sufficient — don't block on load
  const hasBalance = usdcBalance === undefined || usdcBalance >= price;

  const wrongChain = isConnected && chainId !== TARGET_CHAIN.id;

  function extractError(e) {
    if (!e) return 'Unknown error';
    if (typeof e === 'string') return e;
    if (typeof e === 'object') {
      return e.shortMessage || e.message || e.details || JSON.stringify(e);
    }
    return String(e);
  }

  async function handleApprove() {
    setStep('approve');
    setErrorMsg('');
    try {
      // Approve a large amount so user doesn't need to re-approve
      const MAX_UINT = 2n ** 256n - 1n;
      const hash = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [CONTRACT_ADDRESS, MAX_UINT],
      });
      setTxHash(hash);
      // Give the chain a moment then refetch allowance
      await new Promise(r => setTimeout(r, 2000));
      await refetchAllowance();
      // Auto-proceed to claim after approval
      setStep('info');
      // Small delay so React re-renders before we trigger claim
      await new Promise(r => setTimeout(r, 100));
      await handleClaim();
    } catch (e) {
      const msg = extractError(e);
      // User rejected = not an error worth showing
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
      console.log('[tiles.bot] Sending claim tx for tile', tileId);
      const hash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: MBH_ABI,
        functionName: 'claim',
        args: [BigInt(tileId)],
      });
      console.log('[tiles.bot] Claim tx hash:', hash);
      setTxHash(hash);

      // Wait for on-chain confirmation before registering in DB
      if (publicClient) {
        console.log('[tiles.bot] Waiting for tx confirmation...');
        await publicClient.waitForTransactionReceipt({ hash });
        console.log('[tiles.bot] Tx confirmed');
      }

      // Register with local DB via /register (verifies on-chain ownership)
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt > 0) await new Promise(r => setTimeout(r, 3000));
          const res = await fetch(`/api/tiles/${tileId}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ wallet: address, txHash: hash }),
          });
          if (res.ok || res.status === 200) break;
          console.log(`[tiles.bot] Register attempt ${attempt + 1}: ${res.status}`);
        } catch (_) {}
      }

      setStep('success');
      playSound('claim');
      if (onClaimed) onClaimed(tileId, address);
    } catch (e) {
      console.error('[tiles.bot] Claim error:', e);
      const msg = extractError(e);
      if (msg.includes('rejected') || msg.includes('denied') || msg.includes('cancel')) {
        setStep('info');
        return;
      }
      // If revert, show a more helpful message
      if (msg.includes('revert') || msg.includes('Tile already claimed')) {
        setErrorMsg('This tile may already be claimed on-chain. Try a different tile.');
      } else if (msg.includes('transfer failed') || msg.includes('USDC')) {
        setErrorMsg('USDC transfer failed — check your USDC balance on Base and that the approval went through.');
      } else {
        setErrorMsg(msg);
      }
      setStep('error');
    }
  }

  return (
    <div className="retro-modal-overlay" onClick={e => e.stopPropagation()} /* no backdrop dismiss — use ✕ or Cancel */>
      <div className="retro-modal" style={{ minWidth: 360, maxWidth: 440, width: '90vw' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Claim Tile #{tileId}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 20, cursor: 'pointer', padding: '0 4px' }}>✕</button>
        </div>

        {/* Tile position info */}
        <div style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', borderRadius: 2, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#94a3b8' }}>
          <div>Position: Row {Math.floor(tileId / 256)}, Col {tileId % 256}</div>
          <div style={{ marginTop: 4, fontSize: 20, fontWeight: 700, color: '#3b82f6' }}>
            ${parseFloat(priceDisplay).toFixed(4)} USDC
          </div>
          <div style={{ marginTop: 2, fontSize: 11, color: '#9ca3af' }}>Bonding curve price — lower is earlier</div>
        </div>

        {!isConnected ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#94a3b8', marginBottom: 16, fontSize: 14 }}>Connect your wallet to claim this tile.</p>
            <button
              onClick={() => openConnectModal(true)}
              className="btn-retro btn-retro-primary"
              style={{ width: '100%', padding: '14px', fontSize: 15 }}
            >
              Connect Wallet
            </button>
          </div>
        ) : wrongChain ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ color: '#f59e0b', marginBottom: 16, fontSize: 14 }}>
              Switch to {TARGET_CHAIN.name} to claim.
            </p>
            <button
              onClick={() => switchChain({ chainId: TARGET_CHAIN.id })}
              className="btn-retro"
              style={{ borderColor: '#f59e0b', color: '#f59e0b', padding: '10px 24px' }}
            >
              Switch Network
            </button>
          </div>
        ) : step === 'success' ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
            <h3 style={{ color: '#22c55e', margin: '0 0 8px' }}>Tile Claimed!</h3>
            <p style={{ color: '#94a3b8', fontSize: 13 }}>Tile #{tileId} is now yours.</p>
            {txHash && (
              <a href={`https://${TARGET_CHAIN.id === 84532 ? 'sepolia.' : ''}basescan.org/tx/${txHash}`}
                target="_blank" rel="noopener noreferrer"
                style={{ color: '#3b82f6', fontSize: 12 }}>View on Basescan →</a>
            )}
            <button
              onClick={onClose}
              className="btn-retro btn-retro-primary"
              style={{ marginTop: 20, width: '100%', padding: '10px 24px' }}
            >Done</button>
          </div>
        ) : step === 'error' ? (
          <div>
            <p style={{ color: '#ef4444', fontSize: 13, marginBottom: 16 }}>{errorMsg}</p>
            <button onClick={() => setStep('info')}
              className="btn-retro"
              style={{ width: '100%', padding: '10px 24px' }}>
              Try Again
            </button>
          </div>
        ) : (
          <div>
            {/* Balance check */}
            {!hasBalance && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef444440', borderRadius: 2, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#ef4444' }}>
                Insufficient USDC balance. You need ${parseFloat(priceDisplay).toFixed(4)} USDC on {TARGET_CHAIN.name}.
              </div>
            )}

            {/* Step 1: Approve */}
            {!hasAllowance ? (
              <button
                onClick={handleApprove}
                disabled={!hasBalance || step === 'approve'}
                className={`btn-retro btn-retro-primary${step === 'approve' ? ' btn-loading' : ''}`}
                style={{
                  width: '100%', padding: '12px', fontSize: 15,
                  opacity: !hasBalance ? 0.5 : 1,
                  cursor: hasBalance ? 'pointer' : 'not-allowed',
                }}
              >
                {step === 'approve' && <span className="spinner" />}
                {step === 'approve' ? 'Approving USDC…' : '1. Approve USDC'}
              </button>
            ) : (
              /* Step 2: Claim */
              <button
                onClick={handleClaim}
                disabled={!hasBalance || step === 'claim'}
                className={`btn-retro btn-retro-primary${step === 'claim' ? ' btn-loading' : ''}`}
                style={{
                  width: '100%', padding: '12px', fontSize: 15,
                  opacity: !hasBalance ? 0.5 : 1,
                  cursor: hasBalance ? 'pointer' : 'not-allowed',
                }}
              >
                {step === 'claim' && <span className="spinner" />}
                {step === 'claim' ? 'Claiming tile…' : `Claim for $${parseFloat(priceDisplay).toFixed(4)}`}
              </button>
            )}

            <p style={{ textAlign: 'center', marginTop: 12, fontSize: 11, color: '#9ca3af' }}>
              Connected: {address?.slice(0, 6)}...{address?.slice(-4)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
