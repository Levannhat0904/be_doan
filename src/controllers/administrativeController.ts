import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as csv from 'csv-parse';
import { parse } from 'csv-parse';

export const getProvinces = async (req: Request, res: Response) => {
  try {
    const filePath = path.join(__dirname, '../../administrative_maps.csv');
    const provinces = new Map<number, string>();

    const parser = fs.createReadStream(filePath)
      .pipe(parse());

    for await (const record of parser) {
      const code = parseInt(record[1]);
      const name = record[0];
      if (!isNaN(code) && name) {
        provinces.set(code, name);
      }
    }

    const uniqueProvinces = Array.from(provinces.entries()).map(([code, name]) => ({
      name,
      code
    }));

    return res.json(uniqueProvinces);
  } catch (error) {
    console.error('Error reading provinces:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getDistricts = async (req: Request, res: Response) => {
  try {
    const { provinceCode } = req.params;
    const filePath = path.join(__dirname, '../../administrative_maps.csv');
    const districts = new Map<number, string>();

    const parser = fs.createReadStream(filePath)
      .pipe(parse());

    for await (const record of parser) {
      if (record[1] === provinceCode) {
        const code = parseInt(record[3]);
        const name = record[2];
        if (!isNaN(code) && name) {
          districts.set(code, name);
        }
      }
    }

    const uniqueDistricts = Array.from(districts.entries()).map(([code, name]) => ({
      name,
      code
    }));

    return res.json(uniqueDistricts);
  } catch (error) {
    console.error('Error reading districts:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const getWards = async (req: Request, res: Response) => {
  try {
    const { provinceCode, districtCode } = req.params;
    const filePath = path.join(__dirname, '../../administrative_maps.csv');
    const wards = new Map<number, string>();

    const parser = fs.createReadStream(filePath)
      .pipe(parse());

    for await (const record of parser) {
      if (record[1] === provinceCode && record[3] === districtCode) {
        const code = parseInt(record[5]);
        const name = record[4];
        if (!isNaN(code) && name) {
          wards.set(code, name);
        }
      }
    }

    const uniqueWards = Array.from(wards.entries()).map(([code, name]) => ({
      name,
      code
    }));

    return res.json(uniqueWards);
  } catch (error) {
    console.error('Error reading wards:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}; 