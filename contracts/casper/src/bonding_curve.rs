//! Fixed-point exponential bonding curve for tiles.bot pricing.
//!
//! Formula: price_motes = CASPER_START_PRICE * exp(LN_11111 * total_minted / MAX_SUPPLY)
//!
//! Uses 64.64 fixed-point arithmetic (i128 where value = raw / 2^64).

/// Maximum number of tiles (256 * 256 grid)
pub const MAX_SUPPLY: u64 = 65_536;

/// Casper start price in motes: 5 CSPR = 5_000_000_000 motes (9 decimal places)
pub const BASE_PRICE_MOTES: u128 = 5_000_000_000;

/// Maximum batch size
pub const MAX_BATCH_SIZE: u64 = 100;

// -- Fixed-point constants (64.64 format: value * 2^64)

/// ln(11111) ~ 9.31556 in 64.64 fixed-point
const LN_11111_FP: i128 = 171_846_002_439_862_869_197;

/// ln(2) ~ 0.693147 in 64.64 fixed-point
const LN_2_FP: i128 = 12_786_308_645_202_655_660;

/// 1.0 in 64.64 fixed-point
const ONE_FP: i128 = 1_i128 << 64;

/// Compute the price in motes for the `n`th mint (0-indexed).
///
/// Returns u128::MAX if n >= MAX_SUPPLY (sentinel for "sold out").
pub fn compute_price(total_minted: u64) -> u128 {
    if total_minted >= MAX_SUPPLY {
        return u128::MAX;
    }

    // exponent = LN_11111 * total_minted / MAX_SUPPLY (in 64.64)
    let exponent = fp_mul(
        LN_11111_FP,
        fp_from_fraction(total_minted as i128, MAX_SUPPLY as i128),
    );

    // multiplier = exp(exponent) (in 64.64), ranges from 1.0 to ~11111.0
    let multiplier = fp_exp(exponent);

    // price = BASE_PRICE * multiplier
    // To avoid overflow, multiply BASE_PRICE (plain integer) by the fp value,
    // then shift down. This keeps us within i128 range since
    // BASE_PRICE (5B) * max_multiplier_raw (~11111 * 2^64) fits.
    let price = fp_mul_u128(BASE_PRICE_MOTES, multiplier);

    // Ensure minimum price of 1 mote
    if price == 0 {
        1
    } else {
        price
    }
}

/// Compute the total price for a batch of `count` tiles starting at `total_minted`.
pub fn compute_batch_price(total_minted: u64, count: u64) -> u128 {
    let mut total: u128 = 0;
    for i in 0..count {
        let price = compute_price(total_minted + i);
        if price == u128::MAX {
            return u128::MAX;
        }
        total = total.saturating_add(price);
    }
    total
}

// -- Fixed-point arithmetic (64.64 format)

/// Convert a fraction (numerator/denominator) to 64.64 fixed-point.
fn fp_from_fraction(num: i128, denom: i128) -> i128 {
    (num << 64) / denom
}

/// Multiply two 64.64 fixed-point numbers.
/// Uses split-multiply to avoid i128 overflow.
fn fp_mul(a: i128, b: i128) -> i128 {
    // Split each into high and low 64-bit parts to avoid overflow.
    // a = a_hi * 2^64 + a_lo, b = b_hi * 2^64 + b_lo
    // (a * b) >> 64 = a_hi * b_hi * 2^64 + a_hi * b_lo + a_lo * b_hi + (a_lo * b_lo >> 64)
    let mask = (1_i128 << 64) - 1;
    let a_hi = a >> 64;
    let a_lo = a & mask;
    let b_hi = b >> 64;
    let b_lo = b & mask;

    // Each of these terms fits in i128:
    // a_hi, b_hi are at most ~64 bits each, so a_hi*b_hi < 2^128
    // a_hi*b_lo and a_lo*b_hi are cross products, each < 2^128
    let hh = a_hi.checked_mul(b_hi).unwrap_or(i128::MAX);
    let hl = a_hi * b_lo;
    let lh = a_lo * b_hi;
    let ll_shifted = ((a_lo as u128) * (b_lo as u128) >> 64) as i128;

    hh.wrapping_shl(64)
        .wrapping_add(hl)
        .wrapping_add(lh)
        .wrapping_add(ll_shifted)
}

/// Multiply a plain u128 integer by a 64.64 fixed-point value, returning u128.
/// price = integer * fp_value, equivalent to integer * (fp_value / 2^64).
fn fp_mul_u128(integer: u128, fp_value: i128) -> u128 {
    if fp_value <= 0 {
        return 0;
    }
    let fp_unsigned = fp_value as u128;

    // Split to avoid overflow: integer * fp_unsigned >> 64
    let int_hi = integer >> 64;
    let int_lo = integer & ((1u128 << 64) - 1);
    let fp_hi = fp_unsigned >> 64;
    let fp_lo = fp_unsigned & ((1u128 << 64) - 1);

    // Result = int_hi * fp_hi * 2^64 + int_hi * fp_lo + int_lo * fp_hi + (int_lo * fp_lo >> 64)
    let hh = int_hi.saturating_mul(fp_hi);
    let hl = int_hi * fp_lo;
    let lh = int_lo * fp_hi;
    let ll_shifted = int_lo.wrapping_mul(fp_lo) >> 64;

    hh.wrapping_shl(64)
        .wrapping_add(hl)
        .wrapping_add(lh)
        .wrapping_add(ll_shifted)
}

/// Divide two 64.64 fixed-point numbers: (a << 64) / b
/// Uses remainder-based splitting to avoid i128 overflow.
fn fp_div(a: i128, b: i128) -> i128 {
    if b == 0 {
        return i128::MAX;
    }

    // Handle signs
    let sign = if (a < 0) != (b < 0) { -1i128 } else { 1i128 };
    let a_abs = if a < 0 { -a } else { a };
    let b_abs = if b < 0 { -b } else { b };

    // We want (a_abs << 64) / b_abs, but a_abs << 64 may overflow i128.
    // Split into: quotient = a_abs / b_abs, remainder = a_abs % b_abs
    // Then (a_abs << 64) / b_abs = (q << 64) + (r << 64) / b_abs
    // For the remainder term, split the 64-bit shift into two 32-bit shifts
    // to stay within i128 range.
    let q = a_abs / b_abs;
    let r = a_abs % b_abs;

    let q_main = q << 64;

    // (r << 64) / b_abs via two-step 32-bit shifting
    let r_shifted = r << 32;
    let q_rem_hi = r_shifted / b_abs;
    let r_rem = r_shifted % b_abs;
    let r_rem_shifted = r_rem << 32;
    let q_rem_lo = r_rem_shifted / b_abs;

    (q_main + (q_rem_hi << 32) + q_rem_lo) * sign
}

/// Convert 64.64 fixed-point to u128 (truncates fractional part).
#[allow(dead_code)]
fn fp_to_u128(x: i128) -> u128 {
    if x < 0 {
        0
    } else {
        (x >> 64) as u128
    }
}

/// Compute exp(x) for 64.64 fixed-point x.
///
/// Uses the identity: exp(x) = 2^(x / ln(2))
fn fp_exp(x: i128) -> i128 {
    let y = fp_div(x, LN_2_FP);
    fp_exp2(y)
}

/// Compute 2^x for 64.64 fixed-point x.
///
/// Splits x into integer part (bit shift) and fractional part (polynomial approximation).
fn fp_exp2(x: i128) -> i128 {
    if x < 0 {
        let pos_result = fp_exp2(-x);
        if pos_result == 0 {
            return 0;
        }
        return fp_div(ONE_FP, pos_result);
    }

    // Split into integer and fractional parts
    let int_part = (x >> 64) as u32;
    let frac_part = x & ((1_i128 << 64) - 1);

    if int_part >= 127 {
        return i128::MAX;
    }

    // Integer part: 2^int_part in 64.64
    let int_result: i128 = ONE_FP << int_part;

    // Fractional part: 2^frac via polynomial
    let frac_result = exp2_frac(frac_part);

    // Combine: 2^x = 2^int * 2^frac
    fp_mul(int_result, frac_result)
}

/// Approximate 2^x for x in [0, 1) represented as the fractional bits of a 64.64 number.
///
/// Uses a Taylor series / Horner's method (degree 6) for 2^x on [0, 1).
fn exp2_frac(frac: i128) -> i128 {
    const C0: i128 = 18_446_744_073_709_551_616; // 1.0
    const C1: i128 = 12_786_308_645_202_655_660; // ln(2)
    const C2: i128 = 4_431_396_893_702_724_196; // ln(2)^2 / 2
    const C3: i128 = 1_023_870_052_871_026_094; // ln(2)^3 / 6
    const C4: i128 = 177_449_180_399_498_970; // ln(2)^4 / 24
    const C5: i128 = 24_597_782_719_177_498; // ln(2)^5 / 120
    const C6: i128 = 2_841_563_974_498_195; // ln(2)^6 / 720

    let x = frac;

    // Horner's method: c0 + x*(c1 + x*(c2 + x*(c3 + x*(c4 + x*(c5 + x*c6)))))
    let mut result = C6;
    result = C5 + fp_mul(result, x);
    result = C4 + fp_mul(result, x);
    result = C3 + fp_mul(result, x);
    result = C2 + fp_mul(result, x);
    result = C1 + fp_mul(result, x);
    result = C0 + fp_mul(result, x);

    result
}
