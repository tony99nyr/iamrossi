import type { ProteinShakeIngredient, Vitamin } from '@/types';

export const ROSSI_SHAKE = {
    ingredients: [
        {
            name: "Transparent Labs BCAA Glutamine",
            amount: "1/3 scoop",
            calories: 3.3,
            protein: 0,
            carbs: 0.7,
            fat: 0,
            notes: "BCAA 2.7g, Glutamine 1.7g"
        },
        {
            name: "Transparent Labs Whey Protein Isolate",
            amount: "1.25 scoops (overflowing)",
            calories: 150,
            protein: 35,
            carbs: 1.25,
            fat: 0.6,
            notes: "Grass-fed isolate"
        },
        {
            name: "Micro Ingredients Creatine Monohydrate",
            amount: "1 full scoop",
            calories: 0,
            protein: 0,
            carbs: 0,
            fat: 0,
            notes: "Creatine 5g"
        },
        {
            name: "Athletic Greens AG1",
            amount: "1 scoop",
            calories: 50,
            protein: 2,
            carbs: 6,
            fat: 0,
            notes: "75 vitamins & minerals"
        },
        {
            name: "Transparent Labs Grass-Fed Collagen",
            amount: "1/2 scoop",
            calories: 22.5,
            protein: 5,
            carbs: 0,
            fat: 0,
            notes: "Collagen 5.5g"
        }
    ] as ProteinShakeIngredient[],
    servingSize: "32oz blender bottle"
};

export const ROSSI_VITAMINS: Vitamin[] = [
    {
        name: "Life Extension Super Omega-3 Plus",
        dosage: "2 softgels",
        frequency: "Daily",
        notes: "EPA 750mg, DHA 510mg, Olive Extract 200mg"
    },
    {
        name: "Citracal Maximum Plus",
        dosage: "2 caplets",
        frequency: "Daily",
        notes: "Calcium 650mg, Vit D3 1000IU"
    },
    {
        name: "Nutramax Cosamin DS",
        dosage: "3 capsules",
        frequency: "Daily",
        notes: "Glucosamine 1500mg, Chondroitin 1200mg"
    },
    {
        name: "Naturewise Turmeric Curcumin",
        dosage: "3 capsules",
        frequency: "Daily",
        notes: "Curcuminoids 500mg, Organic Ginger"
    },
    {
        name: "Naturebell Magnesium Glycinate",
        dosage: "1 capsule",
        frequency: "Daily (Night)",
        notes: "Magnesium Glycinate 500mg"
    }
];
