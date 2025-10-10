import { Connection, PublicKey } from "@solana/web3.js";

const connection = new Connection(process.env.RPC_URL!);

export async function isValidToken(mintAddress: string) {
    try {
        const mintPubkey = new PublicKey(mintAddress);
        const mintAccount = await connection.getParsedAccountInfo(mintPubkey);

        if (!mintAccount.value) return false;

        return true;
        
    } catch (error) {
        return false;
    }
}