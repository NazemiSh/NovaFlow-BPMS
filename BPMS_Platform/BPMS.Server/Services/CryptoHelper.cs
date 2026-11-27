using System.Security.Cryptography;
using System.Text;

namespace BPMS.Server.Services;

public static class CryptoHelper
{
    // A fixed key derivation seed for consistent AES-GCM or AES-CBC encryption within the application
    private static readonly byte[] Salt = Encoding.UTF8.GetBytes("NovaFlow_BPMS_MasterData_2026_Salt!");
    private const string SecretPhrase = "NovaFlow-Secret-MasterData-EncKey-987456321";

    public static string Encrypt(string plainText)
    {
        if (string.IsNullOrEmpty(plainText)) return string.Empty;

        using var aes = Aes.Create();
        using var pbkdf2 = new Rfc2898DeriveBytes(SecretPhrase, Salt, 10000, HashAlgorithmName.SHA256);
        aes.Key = pbkdf2.GetBytes(32); // 256 bits
        aes.GenerateIV();

        using var encryptor = aes.CreateEncryptor(aes.Key, aes.IV);
        using var ms = new MemoryStream();
        ms.Write(aes.IV, 0, aes.IV.Length);

        using (var cs = new CryptoStream(ms, encryptor, CryptoStreamMode.Write))
        using (var sw = new StreamWriter(cs, Encoding.UTF8))
        {
            sw.Write(plainText);
        }

        return Convert.ToBase64String(ms.ToArray());
    }

    public static string Decrypt(string cipherText)
    {
        if (string.IsNullOrEmpty(cipherText)) return string.Empty;

        try
        {
            var fullCipher = Convert.FromBase64String(cipherText);
            using var aes = Aes.Create();
            using var pbkdf2 = new Rfc2898DeriveBytes(SecretPhrase, Salt, 10000, HashAlgorithmName.SHA256);
            aes.Key = pbkdf2.GetBytes(32);

            var iv = new byte[16];
            Array.Copy(fullCipher, 0, iv, 0, iv.Length);
            aes.IV = iv;

            using var decryptor = aes.CreateDecryptor(aes.Key, aes.IV);
            using var ms = new MemoryStream(fullCipher, 16, fullCipher.Length - 16);
            using var cs = new CryptoStream(ms, decryptor, CryptoStreamMode.Read);
            using var sr = new StreamReader(cs, Encoding.UTF8);

            return sr.ReadToEnd();
        }
        catch
        {
            return string.Empty;
        }
    }
}
