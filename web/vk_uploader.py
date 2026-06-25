import requests

# البيانات الخاصة بك
TOKEN = "YOUR_VK_TOKEN_HERE"  # ضع التوكن الخاص بك هنا
GROUP_ID = 0  # ضع رقم المجموعة الخاص بك هنا
IMAGE_PATH = "test.jpg"  # مسار الصورة التي تريد رفعها
API_VERSION = "5.131"

def upload_photo_to_group(token, group_id, img_path):
    # 1. الحصول على سيرفر الرفع
    url = f"https://api.vk.com/method/photos.getWallUploadServer"
    params = {
        "access_token": token,
        "group_id": group_id,
        "v": API_VERSION
    }
    response = requests.get(url, params=params).json()
    
    if "error" in response:
        print(f"[!] خطأ في الخطوة الأولى: {response['error']['error_msg']}")
        return

    upload_url = response["response"]["upload_url"]
    print("[+] تم الحصول على رابط السيرفر بنجاح.")

    # 2. رفع ملف الصورة إلى السيرفر
    with open(img_path, "rb") as img_file:
        files = {"photo": img_file}
        upload_response = requests.post(upload_url, files=files).json()

    # 3. حفظ الصورة ونشرها في المجموعة
    save_url = "https://api.vk.com/method/photos.saveWallPhoto"
    save_params = {
        "access_token": token,
        "group_id": group_id,
        "photo": upload_response["photo"],
        "server": upload_response["server"],
        "hash": upload_response["hash"],
        "v": API_VERSION
    }
    final_response = requests.get(save_url, params=save_params).json()

    if "error" in final_response:
        print(f"[!] خطأ أثناء حفظ الصورة: {final_response['error']['error_msg']}")
    else:
        photo_data = final_response["response"][0]
        print(f"[+] تم رفع الصورة بنجاح!")
        print(f"[+] رابط الصورة المرفوعة: https://vk.com/photo{photo_data['owner_id']}_{photo_data['id']}")

if __name__ == "__main__":
    upload_photo_to_group(TOKEN, GROUP_ID, IMAGE_PATH)
