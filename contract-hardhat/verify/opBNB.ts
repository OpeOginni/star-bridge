import { run } from "hardhat";

const verify = async (contractAddress: string) => {
    console.log("Verifying contract...")
    try {
        await run("verify:verify", {
            address: contractAddress,
            constructorArguments: [
                "0xcf712f20c85421d00eaa1b6f6545aaeeb4492b75"
            ],
        })
    } catch (e: any) {
        if (e.message.toLowerCase().includes("already verified")) {
            console.log("Already verified!")
        } else {
            console.log(e)
        }
    }
}
// verify("0xD6e869136011388c5E863b859c1e407B7c4DC1e7", );
export default verify;