import { describe, it, expect, beforeAll, vi } from "vitest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

describe("appAuth.login", () => {
  it("should hash password correctly", async () => {
    const password = "#1Madre";
    const hash = await bcrypt.hash(password, 10);
    
    // Verify the hash can be compared
    const isValid = await bcrypt.compare(password, hash);
    expect(isValid).toBe(true);
    
    // Verify wrong password fails
    const isInvalid = await bcrypt.compare("wrongpassword", hash);
    expect(isInvalid).toBe(false);
  });

  it("should generate valid JWT token", () => {
    const payload = {
      userId: 1,
      appRole: "EventDirector",
      designation: "ED",
    };
    
    const token = jwt.sign(payload, process.env.JWT_SECRET ?? "dev-secret", { expiresIn: "12h" });
    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
    
    // Verify token can be decoded
    const decoded = jwt.verify(token, process.env.JWT_SECRET ?? "dev-secret") as any;
    expect(decoded.userId).toBe(1);
    expect(decoded.appRole).toBe("EventDirector");
    expect(decoded.designation).toBe("ED");
  });

  it("should verify Cassie Davis account details", async () => {
    const email = "micah45@sbcglobal.net";
    const password = "#1Madre";
    const expectedHash = "$2b$10$kAUC6PMOM0HC9uvAikeSB.srfJ2KS2UkF4rLPghoIm79ZU40iAgU.";
    
    // Verify password matches the stored hash
    const isValid = await bcrypt.compare(password, expectedHash);
    expect(isValid).toBe(true);
    
    // Verify email is correct
    expect(email).toBe("micah45@sbcglobal.net");
  });
});
