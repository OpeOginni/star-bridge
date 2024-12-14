export class PreCheckoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PreCheckoutError";
    }
}

export class InsufficientVaultBalanceError extends Error {
    token: string;
    required: number;
    available: number;
    chain: string;

    constructor(token: string, required: number, available: number, chain: string) {
        const message = `Insufficient vault balance for ${token}. Required: ${required}, Available: ${available}`;
        super(message);
        this.name = "InsufficientVaultBalanceError";
        this.token = token;
        this.required = required;
        this.available = available;
        this.chain = chain;
    }
}

export class ChainConfigurationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ChainConfigurationError';
    }
}

