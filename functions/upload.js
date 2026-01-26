const {GoogleAIFileManager} = require("@google/generative-ai/server");
const fs = require("fs");
const path = require("path");

// 🔑 حط مفتاحك هنا
const apiKey = "AIzaSyDAE0-iJUruVI5M5v_NpXntiYe8CB62qj0";
const fileManager = new GoogleAIFileManager(apiKey);

/**
 * دالة لرفع كل ملفات الـ PDF الموجودة في فولدر materials
 * وتجهيزها للاستخدام مع Gemini.
 */
async function uploadAllFiles() {
  // اسم الفولدر اللي فيه الملازم
  const folderName = "materials";
  const directoryPath = path.join(__dirname, folderName);

  console.log(`📂 جاري قراءة الملفات من فولدر: ${folderName}...`);

  try {
    const files = fs.readdirSync(directoryPath);
    // تصحيح: إضافة أقواس حول (file)
    const pdfFiles = files.filter((file) => file.endsWith(".pdf"));

    if (pdfFiles.length === 0) {
      console.log("❌ مفيش ملفات PDF في الفولدر ده!");
      return;
    }

    console.log(`found ${pdfFiles.length} PDFs. جاري الرفع... ⏳`);
    console.log("===========================================");

    // تصحيح: استخدام const لأننا مش بنعيد تعيين المتغير
    const uploadedFiles = [];

    for (const file of pdfFiles) {
      const filePath = path.join(directoryPath, file);

      console.log(`⬆️ جاري رفع: ${file}...`);

      const uploadResponse = await fileManager.uploadFile(filePath, {
        mimeType: "application/pdf",
        displayName: file,
      });

      console.log(`✅ تم الرفع: ${uploadResponse.file.uri}`);
      uploadedFiles.push(uploadResponse.file.uri);
    }

    console.log("===========================================");
    console.log("🎉 مبروك! انسخ المصفوفة دي عشان نستخدمها في البوت:");
    console.log(JSON.stringify(uploadedFiles, null, 2));
  } catch (error) {
    console.error("❌ حصل خطأ:", error);
  }
}

uploadAllFiles();
