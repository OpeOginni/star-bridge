export class PreCheckoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PreCheckoutError";
    }
}

export class ChainConfigurationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ChainConfigurationError';
    }
}

