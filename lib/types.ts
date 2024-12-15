import type { ObjectId, Types } from "mongoose";
import { SupportedChains } from "./chains";
import { Tokens } from "./tokens";

export interface PaymentPayload {
    chatId: number;
    walletAddress: string;
    chain: SupportedChains;
    token: Tokens;
    stars: number;
    amountInToken: number;
    amountInUSD: number;
    operationalFee: number;
    serviceFee: number;
    totalFees: number;
    creationTimestamp: number;
    completionTimestamp?: number;
    status: PaymentStatus;
    transactionId?: string;
    telegramPaymentChargeId?: string;
}

export enum PaymentStatus {
    PENDING = "PENDING",
    PROCESSING = "PROCESSING",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED"
}

// For type safety in the bot's session
export interface SessionData {
    step: PaymentStep;
    walletAddress: string;
    selectedChain: SupportedChains | null;
    selectedToken: Tokens | null;
    currentPaymentId?: Types.ObjectId;
    stars?: number;
    amountInUSD?: number;
}

export enum PaymentStep {
    IDLE = "IDLE",
    AWAITING_STARS_INPUT = "AWAITING_STARS_INPUT",
    CHAIN_SELECTION = "CHAIN_SELECTION",
    TOKEN_SELECTION = "TOKEN_SELECTION",
    BUNDLE_SELECTION = "BUNDLE_SELECTION",
    PAYMENT_PENDING = "PAYMENT_PENDING"
} 