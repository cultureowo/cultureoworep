"use strict";

const { connect } = require("../src/database");
const {
    CustomerRepository,
    ParcelRepository,
    ShipmentRepository
} = require("../src/repositories");

const {
    Customer,
    Parcel,
    Shipment,
    ShipmentStatus
} = require("../src/models");

describe("Repository integration tests", () => {
    let client;
    let customers;
    let parcels;
    let shipments;

    beforeAll(async () => {
        client = await connect();

        customers = new CustomerRepository(client);
        parcels = new ParcelRepository(client);
        shipments = new ShipmentRepository(client);
    });

    beforeEach(async () => {
        await client.query(
            "TRUNCATE TABLE shipments, parcels, customers RESTART IDENTITY CASCADE"
        );
    });

    afterAll(async () => {
        await client.end();
    });

    test("creates and retrieves customer", async () => {
        const customer = new Customer(
            0,
            "CUSTOMER-001",
            true
        );

        const created = await customers.create(customer);
        const found = await customers.findById(created.id);

        expect(created.id).toBeGreaterThan(0);
        expect(found).not.toBeNull();
        expect(found.id).toBe(created.id);
        expect(found.code).toBe("CUSTOMER-001");
        expect(found.regular).toBe(true);
    });

    test("updates customer", async () => {
        const created = await customers.create(
            new Customer(0, "CUSTOMER-001", false)
        );

        const updated = new Customer(
            created.id,
            "CUSTOMER-UPDATED",
            true
        );

        await customers.update(updated);

        const found = await customers.findById(created.id);

        expect(found.code).toBe("CUSTOMER-UPDATED");
        expect(found.regular).toBe(true);
    });

    test("deletes customer", async () => {
        const created = await customers.create(
            new Customer(0, "CUSTOMER-001", false)
        );

        await customers.delete(created.id);

        const found = await customers.findById(created.id);

        expect(found).toBeNull();
    });

    test("creates and retrieves parcel", async () => {
        const parcel = new Parcel(
            0,
            "PARCEL-001",
            2000,
            50000,
            20,
            15,
            10
        );

        const created = await parcels.create(parcel);
        const found = await parcels.findById(created.id);

        expect(created.id).toBeGreaterThan(0);
        expect(found).not.toBeNull();
        expect(found.code).toBe("PARCEL-001");
        expect(found.weightGrams).toBe(2000);
        expect(found.declaredValue).toBe(50000);
        expect(found.lengthCm).toBe(20);
        expect(found.widthCm).toBe(15);
        expect(found.heightCm).toBe(10);
    });

    test("updates parcel", async () => {
        const created = await parcels.create(
            new Parcel(
                0,
                "PARCEL-001",
                1000,
                50000,
                10,
                10,
                10
            )
        );

        const updated = new Parcel(
            created.id,
            "PARCEL-UPDATED",
            2500,
            70000,
            20,
            20,
            20
        );

        await parcels.update(updated);

        const found = await parcels.findById(created.id);

        expect(found.code).toBe("PARCEL-UPDATED");
        expect(found.weightGrams).toBe(2500);
        expect(found.declaredValue).toBe(70000);
        expect(found.lengthCm).toBe(20);
        expect(found.widthCm).toBe(20);
        expect(found.heightCm).toBe(20);
    });

    test("deletes parcel", async () => {
        const created = await parcels.create(
            new Parcel(
                0,
                "PARCEL-001",
                1000,
                50000
            )
        );

        await parcels.delete(created.id);

        const found = await parcels.findById(created.id);

        expect(found).toBeNull();
    });

    test("creates and retrieves shipment", async () => {
        const customer = await customers.create(
            new Customer(0, "CUSTOMER-001", false)
        );

        const parcel = await parcels.create(
            new Parcel(
                0,
                "PARCEL-001",
                1000,
                50000
            )
        );

        const shipment = new Shipment({
            id: 0,
            reference: "SHIPMENT-001",
            customerId: customer.id,
            parcelId: parcel.id,
            distanceKm: 100,
            urgent: false,
            pickup: false,
            regular: customer.regular,
            weightGrams: parcel.weightGrams,
            declaredValue: parcel.declaredValue,
            lengthCm: parcel.lengthCm,
            widthCm: parcel.widthCm,
            heightCm: parcel.heightCm,
            baseFee: 7000,
            adjustment: 0,
            total: 7000,
            refund: 0,
            status: ShipmentStatus.REGISTERED
        });

        const created = await shipments.create(shipment);
        const found = await shipments.findById(created.id);

        expect(created.id).toBeGreaterThan(0);
        expect(found).not.toBeNull();
        expect(found.reference).toBe("SHIPMENT-001");
        expect(found.customerId).toBe(customer.id);
        expect(found.parcelId).toBe(parcel.id);
        expect(found.status).toBe(ShipmentStatus.REGISTERED);
        expect(found.total).toBe(7000);
    });

    test("finds shipments by customer and status", async () => {
        const customer = await customers.create(
            new Customer(0, "CUSTOMER-001", false)
        );

        const parcel = await parcels.create(
            new Parcel(
                0,
                "PARCEL-001",
                1000,
                50000
            )
        );

        await shipments.create(
            new Shipment({
                id: 0,
                reference: "SHIPMENT-001",
                customerId: customer.id,
                parcelId: parcel.id,
                distanceKm: 100,
                urgent: false,
                pickup: false,
                regular: false,
                weightGrams: 1000,
                declaredValue: 50000,
                lengthCm: 10,
                widthCm: 10,
                heightCm: 10,
                baseFee: 7000,
                adjustment: 0,
                total: 7000,
                refund: 0,
                status: ShipmentStatus.REGISTERED
            })
        );

        const found = await shipments.findShipments(
            customer.id,
            ShipmentStatus.REGISTERED
        );

        expect(found).toHaveLength(1);
        expect(found[0].reference).toBe("SHIPMENT-001");
        expect(found[0].status).toBe(ShipmentStatus.REGISTERED);
    });

    test("updates shipment status", async () => {
        const customer = await customers.create(
            new Customer(0, "CUSTOMER-001", false)
        );

        const parcel = await parcels.create(
            new Parcel(
                0,
                "PARCEL-001",
                1000,
                50000
            )
        );

        const created = await shipments.create(
            new Shipment({
                id: 0,
                reference: "SHIPMENT-001",
                customerId: customer.id,
                parcelId: parcel.id,
                distanceKm: 100,
                urgent: false,
                pickup: false,
                regular: false,
                weightGrams: 1000,
                declaredValue: 50000,
                lengthCm: 10,
                widthCm: 10,
                heightCm: 10,
                baseFee: 7000,
                adjustment: 0,
                total: 7000,
                refund: 0,
                status: ShipmentStatus.REGISTERED
            })
        );

        await shipments.updateStatus(
            created.id,
            ShipmentStatus.REGISTERED,
            ShipmentStatus.DISPATCHED,
            0
        );

        const found = await shipments.findById(created.id);

        expect(found.status).toBe(ShipmentStatus.DISPATCHED);
        expect(found.refund).toBe(0);
    });
});