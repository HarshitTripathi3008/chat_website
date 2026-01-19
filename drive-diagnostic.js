const { getDriveClient } = require('./config/googleDrive');
require('dotenv').config();

async function diagnose() {
    console.log("🔍 Starting Google Drive Diagnostic...");
    const drive = getDriveClient();

    if (!drive) {
        console.error("❌ Drive client failed to initialize.");
        return;
    }

    try {
        // 1. Check who I am (indirectly via what I can see)
        console.log("📧 Service Account Email (from .env):", process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);

        // 2. List ALL files I can see
        console.log("\n📂 Listing ALL files visible to this Service Account:");
        const res = await drive.files.list({
            pageSize: 10,
            fields: 'files(id, name, mimeType, owners)',
            q: "trashed=false"
        });

        const files = res.data.files;
        if (files.length) {
            console.log(`✅ Found ${files.length} files/folders:`);
            files.map((file) => {
                console.log(` - [${file.mimeType}] ${file.name} (ID: ${file.id})`);
                console.log(`   Owner: ${file.owners && file.owners[0] ? file.owners[0].emailAddress : 'Unknown'}`);
            });
        } else {
            console.log("⚠️  No files found. The Service Account sees NOTHING.");
            console.log("   (This confirms that no folders have been shared with it yet, or the share hasn't propagated).");
        }

        // 3. Check specific folder
        const targetId = process.env.GOOGLE_DRIVE_FOLDER_ID;
        console.log(`\n🎯 Checking Target Folder ID: ${targetId}`);

        try {
            const folderRes = await drive.files.get({
                fileId: targetId,
                fields: 'name, capabilities, owners'
            });
            console.log(`✅ Success! Can see folder: "${folderRes.data.name}"`);
            console.log(`   Owner: ${folderRes.data.owners && folderRes.data.owners[0] ? folderRes.data.owners[0].emailAddress : 'Unknown'}`);
            console.log(`   Capabilities:`, folderRes.data.capabilities);
        } catch (err) {
            console.error(`❌ FAILED to access target folder.`);
            console.error(`   Error Code: ${err.code}`);
            console.error(`   Message: ${err.message}`);
        }

    } catch (error) {
        console.error("❌ Diagnostic Error:", error);
    }
}

diagnose();
