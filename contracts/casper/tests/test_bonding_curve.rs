//! Tests for the bonding curve pricing logic.
//! Formula: price_motes = 10_000_000 * exp(ln(11111) * total_minted / 65536)
//! Range: 0.01 CSPR (10M motes) at mint 0 -> 111.11 CSPR (111.11B motes) at mint 65535

#[cfg(test)]
mod tests {
    use tiles_bot_nft::bonding_curve;

    #[test]
    fn price_at_zero_mints() {
        let price = bonding_curve::compute_price(0);
        // At 0 mints, price should be ~10_000_000 motes (0.01 CSPR)
        let expected: u128 = 10_000_000;
        let tolerance = expected / 1000; // 0.1%
        assert!(
            price >= expected - tolerance && price <= expected + tolerance,
            "Price at 0 mints: {} (expected ~{})",
            price,
            expected
        );
    }

    #[test]
    fn price_at_max_mints() {
        let price = bonding_curve::compute_price(65535);
        // At 65535 mints, price should be ~111_110_000_000 motes (111.11 CSPR)
        let expected: u128 = 111_110_000_000;
        let tolerance = expected / 100; // 1% tolerance at the high end
        assert!(
            price >= expected - tolerance && price <= expected + tolerance,
            "Price at 65535 mints: {} (expected ~{})",
            price,
            expected
        );
    }

    #[test]
    fn price_is_monotonically_increasing() {
        let mut prev = bonding_curve::compute_price(0);
        for i in (1..65536).step_by(100) {
            let current = bonding_curve::compute_price(i);
            assert!(
                current >= prev,
                "Price decreased at mint {}: {} < {}",
                i,
                current,
                prev
            );
            prev = current;
        }
    }

    #[test]
    fn price_at_midpoint() {
        let price = bonding_curve::compute_price(32768);
        // At midpoint: exp(ln(11111) * 0.5) = sqrt(11111) ~ 105.41
        // price = 0.01 * 105.41 ~ 1.054 CSPR ~ 1_054_000_000 motes
        let expected: u128 = 1_054_000_000;
        let tolerance = expected / 50; // 2% tolerance
        assert!(
            price >= expected - tolerance && price <= expected + tolerance,
            "Price at 32768 mints: {} (expected ~{})",
            price,
            expected
        );
    }

    #[test]
    fn batch_price_sums_correctly() {
        let start = 100u64;
        let count = 10u64;
        let batch_total = bonding_curve::compute_batch_price(start, count);

        let mut manual_sum: u128 = 0;
        for i in 0..count {
            manual_sum += bonding_curve::compute_price(start + i);
        }

        assert_eq!(
            batch_total, manual_sum,
            "Batch price {} != manual sum {}",
            batch_total, manual_sum
        );
    }

    #[test]
    fn price_at_max_supply_returns_max() {
        let price = bonding_curve::compute_price(65536);
        assert_eq!(price, u128::MAX);
    }
}
