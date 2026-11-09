"use strict";
const { ShippingService } = require("../src/service");

describe("ShippingService unit tests (no database or network)", () => {
    const service = new ShippingService({}, {}, {}, {});

    test.each([[1000, 100, 7000], [5000, 100, 11000], [1001, 100, 8000], [30000, 5000, 85000]])(
        "base fee for %i grams and %i km is %i", (weight, distance, expected) => {
            expect(service.calculateBaseFee(weight, distance)).toBe(expected);
        }
    );
    test.each([[9999, true, 0], [10000, true, 1000], [11000, false, 0]])(
        "discount for fee %i and regular=%s is %i", (fee, regular, expected) => {
            expect(service.calculateDiscount(fee, regular)).toBe(expected);
        }
    );
    test.each([0, 30001, 1.5])("rejects invalid weight %s", weight => {
        expect(() => service.calculateBaseFee(weight, 100)).toThrow(RangeError);
    });
    test("rejects invalid distance", () => {
        expect(() => service.calculateBaseFee(1000, 0)).toThrow(RangeError);
    });
    test("refund equals total", () => {
        expect(service.calculateRefund(11000)).toBe(11000);
    });
});
