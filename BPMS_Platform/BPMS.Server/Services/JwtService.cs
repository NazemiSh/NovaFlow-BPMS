using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;

namespace BPMS.Server.Services;

public interface IJwtService
{
    string GenerateToken(int userId, string username, string displayName, IEnumerable<string> roles);
    ClaimsPrincipal? ValidateToken(string token);
    int ExpirationMinutes { get; }
}

public class JwtService : IJwtService
{
    private readonly IConfiguration _config;
    private readonly SigningCredentials _signingCredentials;
    private readonly SecurityKey _securityKey;

    public int ExpirationMinutes => int.Parse(_config["Jwt:ExpirationMinutes"] ?? "60");

    public JwtService(IConfiguration config)
    {
        _config = config;
        var secret = config["Jwt:SecretKey"] ?? throw new InvalidOperationException("Jwt:SecretKey not configured");
        _securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));
        _signingCredentials = new SigningCredentials(_securityKey, SecurityAlgorithms.HmacSha256Signature);
    }

    public string GenerateToken(int userId, string username, string displayName, IEnumerable<string> roles)
    {
        var expMinutes = int.Parse(_config["Jwt:ExpirationMinutes"] ?? "60");
        var expires = DateTime.UtcNow.AddMinutes(expMinutes);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, userId.ToString()),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            new Claim(JwtRegisteredClaimNames.Iat, DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString()),
            new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
            new Claim(ClaimTypes.Name, username),
            new Claim("display_name", displayName),
            new Claim("username", username),
        };

        if (roles.Any())
            claims = claims.Concat(roles.Select(r => new Claim(ClaimTypes.Role, r))).ToArray();

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"],
            audience: _config["Jwt:Audience"],
            claims: claims,
            expires: expires,
            signingCredentials: _signingCredentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public ClaimsPrincipal? ValidateToken(string token)
    {
        try
        {
            var handler = new JwtSecurityTokenHandler();
            var validationParameters = new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = _securityKey,
                ValidIssuer = _config["Jwt:Issuer"],
                ValidAudience = _config["Jwt:Audience"],
                ValidateIssuer = true,
                ValidateAudience = true,
                ValidateLifetime = true,
                ClockSkew = TimeSpan.Zero
            };
            return handler.ValidateToken(token, validationParameters, out _);
        }
        catch
        {
            return null;
        }
    }
}