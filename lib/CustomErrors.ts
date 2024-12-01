export class PreCheckoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PreCheckoutError";
    }
}