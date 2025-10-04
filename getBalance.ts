import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

const connection = new Connection(process.env.RPC_URL!);

export async function getBalanceMessage(publicKey: string): Promise<{ message: string }> {
    const balance = await connection.getBalance(new PublicKey(publicKey));
    return {
        message: `Balance: ${balance / LAMPORTS_PER_SOL} SOL`
    }
}