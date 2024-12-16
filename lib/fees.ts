export interface FeeStructure {
    baseRate: number;      // $0.013 per star (what we receive from Telegram)
    operationalFee: number; // $0.1
    smallTxFee: number;     // 2%
    largeTxFee: number;     // 1%
    minimumTx: number;      // $13
}

// export const FEES: FeeStructure = {
//     baseRate: 0.013,      // What we actually receive per star
//     operationalFee: 0.1,
//     smallTxFee: 0.02,
//     largeTxFee: 0.01,
//     minimumTx: 13
// };

export const FEES: FeeStructure = {
    baseRate: 0.01,      // Keep the base rate the same
    operationalFee: 0,   // No operational fee
    smallTxFee: 0,       // No percentage fee for small transactions
    largeTxFee: 0,       // No percentage fee for large transactions
    minimumTx: 0         // No minimum transaction amount
};


export interface TransactionBreakdown {
    starsRequired: number;
    originalAmount: number;
    operationalFee: number;
    percentageFee: number;
    totalFees: number;
    netAmount: number;
    profit: number;
}

export function calculateTransactionBreakdown(stars: number): TransactionBreakdown {
    const originalAmount = stars * FEES.baseRate;

    if (originalAmount < FEES.minimumTx) {
        throw new Error(`Minimum transaction amount is $${FEES.minimumTx}`);
    }

    const operationalFee = FEES.operationalFee;
    const percentageFee = originalAmount * (originalAmount >= 500 ? FEES.largeTxFee : FEES.smallTxFee);

    const totalFees = operationalFee + percentageFee;
    const netAmount = originalAmount - totalFees;
    const profit = totalFees; // All fees are our profit since Telegram already took their cut

    return {
        starsRequired: stars,
        originalAmount,
        operationalFee,
        percentageFee,
        totalFees,
        netAmount,
        profit
    };
} 