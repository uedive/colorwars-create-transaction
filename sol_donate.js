// 環境変数からカスタムRPC URLと秘密鍵を取得
const MAIN_RPC_URL = process.env.MAIN_RPC_URL;

// 固定の宛先アドレス
const TO_ADDRESS = "AUNVJ3h4RJ4iGcCGnJYzkXoqttgSjRrk7w71ziSDvB6h";

const {
    Connection,
    PublicKey,
    VersionedTransaction,
    TransactionMessage,
    SystemProgram,
} = require("@solana/web3.js");

async function createVersionedTransaction(fromAddress, toAddress, amount, recentBlockhash) {
    const lamports = Math.floor(amount * 1e9);

    const fromPubkey = new PublicKey(fromAddress);
    const toPubkey = new PublicKey(toAddress);

    const instruction = SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports,
    });

    const messageV0 = new TransactionMessage({
        payerKey: fromPubkey,
        recentBlockhash: recentBlockhash,
        instructions: [instruction],
    }).compileToV0Message();

    const versionedTransaction = new VersionedTransaction(messageV0);

    const serializedTransaction = versionedTransaction.serialize();
    console.log("Serialized Transaction (Raw Buffer):", serializedTransaction);

    // Buffer に変換して Base64 エンコード
    const base64Transaction = Buffer.from(serializedTransaction).toString("base64");
    console.log("Serialized Transaction (Base64):", base64Transaction);
    return base64Transaction;
}

exports.handler = async (event) => {
    const connection = new Connection(MAIN_RPC_URL);

    try {
        // リクエストボディをパース
        const requestBody = JSON.parse(event.body);
        const headers = event.headers;

        // 環境変数から認証トークンを取得
        const authToken = process.env.AUTH_TOKEN;

        // Authorizationヘッダーを取得（小文字も考慮）
        const authorizationHeader = headers.Authorization || headers.authorization;

        console.log("Authorization Header:", authorizationHeader);

        // Authorizationヘッダーの存在と値を検証
        if (!authorizationHeader || authorizationHeader !== authToken) {
            return {
                statusCode: 403,
                body: JSON.stringify({
                    message: 'Unauthorized',
                    receivedAuthorization: authorizationHeader,
                    rawHeaders: headers, // ヘッダー全体をレスポンスに含める（デバッグ用）
                }),
            };
        }


        const fromAddress = requestBody.from_address;
        const amount = parseFloat(requestBody.amount);
        const toAddress = TO_ADDRESS;

        const { blockhash } = await connection.getLatestBlockhash();

        const transaction = await createVersionedTransaction(fromAddress, toAddress, amount, blockhash);
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                transaction, // Base64形式のトランザクション
                recentBlockhash: blockhash,
            }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: error.message,
            }),
        };
    }
};