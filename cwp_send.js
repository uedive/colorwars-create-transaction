const {
    Connection,
    PublicKey,
    Transaction,
    VersionedTransaction,
    TransactionMessage,
} = require("@solana/web3.js");
const {
    createTransferInstruction,
    createAssociatedTokenAccountInstruction,
} = require("@solana/spl-token");

const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

async function getOrCreateTokenAccountInstruction(connection, transaction, owner, mint, payer) {
    const ownerPubkey = new PublicKey(owner);
    const mintPubkey = new PublicKey(mint);

    // トークンアカウントの存在確認
    const accounts = await connection.getTokenAccountsByOwner(ownerPubkey, {
        mint: mintPubkey,
        programId: TOKEN_2022_PROGRAM_ID,
    });

    // 既存のトークンアカウントがあればそのアドレスを返す
    if (accounts.value.length > 0) {
        return new PublicKey(accounts.value[0].pubkey);
    }

    // アカウントが存在しない場合、作成指示をトランザクションに追加
    const associatedTokenAddress = await PublicKey.createWithSeed(
        ownerPubkey,
        mintPubkey.toBase58(),
        TOKEN_2022_PROGRAM_ID
    );

    transaction.add(
        createAssociatedTokenAccountInstruction(
            payer, // Fee payer for the account creation
            associatedTokenAddress, // 新しく作成するトークンアカウント
            ownerPubkey, // アカウントの所有者
            mintPubkey // トークンの Mint アドレス
        )
    );

    return associatedTokenAddress;
}


async function createToken2022Transaction(fromAddress, toAddress, amount, recentBlockhash, connection) {
    const lamports = Math.floor(amount * 1e9); // トークンの量をラメポート単位に変換
    const fromPubkey = new PublicKey(fromAddress);

    // トランザクションの準備
    const transaction = new Transaction();

    // from アカウントの存在確認または作成
    const fromTokenAccount = await getOrCreateTokenAccountInstruction(
        connection, transaction, fromAddress, "6uDhUuiNQvstbb2mgNvFvNsQJZ1XWFQCiDTKGuxozFeo", fromPubkey
    );

    // to アカウントの存在確認または作成
    const toTokenAccount = await getOrCreateTokenAccountInstruction(
        connection, transaction, toAddress, "6uDhUuiNQvstbb2mgNvFvNsQJZ1XWFQCiDTKGuxozFeo", fromPubkey
    );

    console.log("FTA: [" + fromTokenAccount + "]");
    console.log("TTA: [" + toTokenAccount + "]");

    // トークン転送インストラクションを追加
    const transferInstruction = createTransferInstruction(
        fromTokenAccount,
        toTokenAccount,
        fromPubkey,
        lamports,
        [],
        TOKEN_2022_PROGRAM_ID // Token2022 プログラムID
    );
    transaction.add(transferInstruction);

    // トランザクションメッセージを生成
    const messageV0 = new TransactionMessage({
        payerKey: fromPubkey,
        recentBlockhash: recentBlockhash,
        instructions: transaction.instructions,
    }).compileToV0Message();

    const versionedTransaction = new VersionedTransaction(messageV0);

    // トランザクションのシミュレーション
    const simulationResult = await connection.simulateTransaction(versionedTransaction);
    if (simulationResult.value.err) {
        console.error("Simulation Error:", simulationResult.value.logs);
        throw new Error(`Transaction simulation failed: ${simulationResult.value.err}`);
    }

    const serializedTransaction = versionedTransaction.serialize();
    return Buffer.from(serializedTransaction).toString("base64");
}

exports.handler = async (event) => {
    const connection = new Connection(process.env.MAIN_RPC_URL || "https://api.devnet.solana.com");

    try {
        const requestBody = JSON.parse(event.body);
        const fromAddress = requestBody.from_address;
        const toAddress = requestBody.to_address;
        const amount = parseFloat(requestBody.amount);

        console.log("TEST_TOKEN_MINT_ADDRESS:", "6uDhUuiNQvstbb2mgNvFvNsQJZ1XWFQCiDTKGuxozFeo");
        console.log("From Address:", fromAddress);
        console.log("To Address:", toAddress);

        if (isNaN(amount) || amount <= 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: "Invalid amount. Must be a positive number.",
                }),
            };
        }

        const { blockhash } = await connection.getLatestBlockhash();

        // トランザクションを作成
        const transaction = await createToken2022Transaction(fromAddress, toAddress, amount, blockhash, connection);

        return {
            statusCode: 200,
            body: JSON.stringify({
                transaction, // Base64形式のトランザクション
                recentBlockhash: blockhash,
            }),
        };
    } catch (error) {
        console.error("Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: error.message,
            }),
        };
    }
};