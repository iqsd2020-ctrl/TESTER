#!/bin/sh

# اسم الملف الناتج
OUT="final_project.txt"

# أنواع الملفات التي نريد تجاهلها (أضف ما تريد هنا)
# نستخدم grep للاستثناء لأنه أضمن في أندرويد
IGNORE="\.(png|jpg|jpeg|gif|webp|ico|mp3|wav|pdf|zip|rar|apk)$"

echo "جاري العمل... يرجى الانتظار"

# 1. كتابة الهيكل (قائمة الملفات)
echo "=== STRUCTURE ===" > "$OUT"
find . | grep -vE "$IGNORE" | grep -v "/\." >> "$OUT"

# 2. كتابة المحتوى
echo -e "\n\n=== CONTENT ===" >> "$OUT"

# البحث عن الملفات وتصفيتها ثم قراءتها واحدة تلو الأخرى
find . -type f | grep -vE "$IGNORE" | grep -v "/\." | while read -r file; do
    echo -e "\n\n----------------------------------------" >> "$OUT"
    echo "FILE: $file" >> "$OUT"
    echo -e "----------------------------------------\n" >> "$OUT"
    cat "$file" >> "$OUT"
done

echo "تم الانتهاء! الملف جاهز باسم $OUT"
