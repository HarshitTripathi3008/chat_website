const { getDriveClient } = require('./config/googleDrive');
const fs = require('fs');
const path = require('path');

async function testUpload() {
    console.log("Testing Google Drive Upload...");
    const drive = getDriveClient();

    if (!drive) {
        console.error("❌ Drive client not initialized.");
        return;
    }

    try {
        const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
        console.log("Target Folder ID:", folderId || "Not Set (Using Root)");

        // 1. Try to check folder access
        if (folderId) {
            try {
                const folderRes = await drive.files.get({
                    fileId: folderId,
                    fields: 'name, capabilities'
                });
                console.log(`✅ Access confirmed to folder: "${folderRes.data.name}"`);
                console.log(`   Can add children? ${folderRes.data.capabilities.canAddChildren}`);

                if (!folderRes.data.capabilities.canAddChildren) {
                    console.error("❌ PERMISSION ERROR: Service account is a VIEWER. It must be an EDITOR.");
                    return;
                }
            } catch (err) {
                console.error("❌ Basic access failed. The Service Account cannot see this folder.");
                console.error("   Ensure this email is added:", process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
                throw err;
            }
        }


        const fileMetadata = {
            name: 'test-upload.txt',
            parents: folderId ? [folderId] : []
        };

        const media = {
            mimeType: 'text/plain',
            body: 'Hello from Chat App verification script!',
        };

        const res = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, name, webViewLink, webContentLink',
        });

        console.log("✅ Upload successful!");
        console.log("File ID:", res.data.id);
        console.log("View Link:", res.data.webViewLink);

        // Make public
        await drive.permissions.create({
            fileId: res.data.id,
            requestBody: {
                role: 'reader',
                type: 'anyone',
            },
        });
        console.log("✅ Permissions set to public.");

        // Clean up
        await drive.files.delete({ fileId: res.data.id });
        console.log("✅ Test file deleted.");

    } catch (error) {
        console.error("❌ Error during test:", error);
        if (error.code === 403) {
            console.error("💡 Tip: Service Accounts have 0 storage. You MUST share a folder with the service account email and set GOOGLE_DRIVE_FOLDER_ID.");
        }
    }
}

testUpload();
