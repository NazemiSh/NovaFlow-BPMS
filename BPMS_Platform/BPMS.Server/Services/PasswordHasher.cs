using System.Security.Cryptography;

namespace BPMS.Server.Services;

/// <summary>
/// PBKDF2 password hashing and verification using SHA-256.
/// Format: PBKDF2|iterations|salt(b64)|hash(b64)
/// </summary>
public class PasswordHasher
{
    private const int Iterations = 600_000;
    private const int SaltBytes = 32;
    private const int HashBytes = 32;

    public string HashPassword(string password)
    {
        using var rng = RandomNumberGenerator.Create();
        var salt = new byte[SaltBytes];
        rng.GetBytes(salt);
        using var deriveBytes = new Rfc2898DeriveBytes(
            password, salt, Iterations, HashAlgorithmName.SHA256);
        var hash = deriveBytes.GetBytes(HashBytes);
        return $"PBKDF2|{Iterations}|{Convert.ToBase64String(salt)}|{Convert.ToBase64String(hash)}";
    }

    public bool VerifyPassword(string password, string storedHash)
    {
        if (string.IsNullOrEmpty(storedHash) || !storedHash.StartsWith("PBKDF2|"))
            return false;
        var parts = storedHash.Split('|');
        if (parts.Length != 4) return false;

        var iterations = int.Parse(parts[1]);
        var salt = Convert.FromBase64String(parts[2]);
        var hashBytes = Convert.FromBase64String(parts[3]);

        using var deriveBytes = new Rfc2898DeriveBytes(password, salt, iterations, HashAlgorithmName.SHA256);
        var hash = deriveBytes.GetBytes(hashBytes.Length);
        return CryptographicOperations.FixedTimeEquals(hash, hashBytes);
    }
}