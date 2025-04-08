export interface IWard {
  name: string;
  code: number;
}

export interface IDistrict {
  name: string;
  code: number;
  wards: IWard[];
}

export interface IProvince {
  name: string;
  code: number;
  districts: IDistrict[];
} 