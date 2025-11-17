import vtkPolyData from "@kitware/vtk.js/Common/DataModel/PolyData";
import vtkPoints from "@kitware/vtk.js/Common/Core/Points";
import vtkCellArray from "@kitware/vtk.js/Common/Core/CellArray";
import vtkDataArray from "@kitware/vtk.js/Common/Core/DataArray";

// OCCT types
interface OcctMeshData {
  attributes: {
    position: {
      array: Float32Array;
    };
    normal?: {
      array: Float32Array;
    };
  };
  index: {
    array: Uint32Array;
  };
}

interface OcctShape {
  color?: number[];
  brep_faces?: OcctShape[];
  mesh?: OcctMeshData;
}

interface OcctResult {
  success: boolean;
  meshes?: OcctMeshData[];
  root?: {
    shapes?: OcctShape[];
  };
  error?: string;
}

interface OcctLibrary {
  ReadStepFile: (buffer: Uint8Array, params: any) => OcctResult;
  ReadIgesFile: (buffer: Uint8Array, params: any) => OcctResult;
  ReadBrepFile: (buffer: Uint8Array, params: any) => OcctResult;
}

declare global {
  interface Window {
    occtimportjs?: () => Promise<OcctLibrary>;
  }
}

/**
 * BREP formatlarını (STEP, IGES, BREP) VTK PolyData'ya dönüştürür
 * occt-import-js kullanarak tessellation yapar
 */
export class BrepToStlConverter {
  private static occtLib: OcctLibrary | null = null;
  private static loadingPromise: Promise<OcctLibrary> | null = null;

  /**
   * OCCT kütüphanesini yükler (lazy loading)
   */
  private static async loadOcct(): Promise<OcctLibrary> {
    if (this.occtLib) {
      return this.occtLib;
    }

    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = new Promise<OcctLibrary>(async (resolve, reject) => {
      try {
        console.log('[BrepConverter] Loading OCCT library from CDN...');
        // OCCT kütüphanesini CDN'den yükle
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/occt-import-js.js';
        script.async = true;

        script.onload = async () => {
          console.log('[BrepConverter] OCCT script loaded, initializing...');
          if (window.occtimportjs) {
            this.occtLib = await window.occtimportjs();
            console.log('[BrepConverter] OCCT library initialized successfully');
            resolve(this.occtLib!);
          } else {
            console.error('[BrepConverter] occtimportjs not found on window');
            reject(new Error('OCCT library failed to initialize'));
          }
        };

        script.onerror = () => {
          console.error('[BrepConverter] Failed to load OCCT script');
          reject(new Error('Failed to load OCCT library from CDN'));
        };

        document.head.appendChild(script);
      } catch (error) {
        console.error('[BrepConverter] Exception during OCCT load:', error);
        reject(error);
      }
    });

    return this.loadingPromise;
  }

  /**
   * BREP dosyasını VTK PolyData'ya dönüştürür
   * @param file - STEP, IGES veya BREP dosyası
   * @param onProgress - İlerleme callback'i (0-100)
   * @returns VTK PolyData nesnesi
   */
  static async convertToPolyData(
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<vtkPolyData> {
    onProgress?.(10);

    // OCCT kütüphanesini yükle
    const occt = await this.loadOcct();
    onProgress?.(20);

    // Dosyayı ArrayBuffer olarak oku
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    onProgress?.(30);

    // Mesh kalite parametreleri
    const params = {
      linearUnit: 'millimeter',
      linearDeflectionType: 'bounding_box_ratio',
      linearDeflection: 0.001
    };

    // Dosya uzantısına göre okuyucu seç
    const extension = file.name.split('.').pop()?.toLowerCase();
    let result: OcctResult;

    onProgress?.(40);

    console.log(`[BrepConverter] Processing ${extension} file, size: ${uint8Array.length} bytes`);

    switch (extension) {
      case 'step':
      case 'stp':
        console.log('[BrepConverter] Calling ReadStepFile...');
        result = occt.ReadStepFile(uint8Array, params);
        break;
      case 'iges':
      case 'igs':
        console.log('[BrepConverter] Calling ReadIgesFile...');
        result = occt.ReadIgesFile(uint8Array, params);
        break;
      case 'brep':
        console.log('[BrepConverter] Calling ReadBrepFile...');
        result = occt.ReadBrepFile(uint8Array, params);
        break;
      default:
        throw new Error(`Unsupported BREP format: .${extension}`);
    }

    console.log('[BrepConverter] OCCT result:', result);
    onProgress?.(60);

    if (!result.success) {
      console.error('[BrepConverter] Parse failed:', result);
      throw new Error(result.error || 'Failed to parse BREP file');
    }

    // Mesh verilerini al (yeni API result.meshes kullanıyor)
    const meshes = result.meshes || [];

    if (meshes.length === 0) {
      console.error('[BrepConverter] No meshes found in result');
      throw new Error('No geometry found in BREP file');
    }

    console.log(`[BrepConverter] Found ${meshes.length} mesh(es)`);

    // Tüm mesh verilerini topla
    const allVertices: number[] = [];
    const allNormals: number[] = [];
    const allIndices: number[] = [];
    let vertexOffset = 0;

    for (const meshData of meshes) {
      if (!meshData.attributes?.position?.array) {
        console.warn('[BrepConverter] Mesh without position data, skipping');
        continue;
      }

      const positions = meshData.attributes.position.array;
      const normals = meshData.attributes.normal?.array;
      const indices = meshData.index?.array;

      // Vertex ve normal verilerini ekle
      for (let i = 0; i < positions.length; i++) {
        allVertices.push(positions[i]);
        if (normals && i < normals.length) {
          allNormals.push(normals[i]);
        }
      }

      // Index'leri offset ile ekle
      if (indices) {
        for (let i = 0; i < indices.length; i++) {
          allIndices.push(indices[i] + vertexOffset);
        }
      }

      vertexOffset += positions.length / 3;
    }

    console.log(`[BrepConverter] Total vertices: ${allVertices.length / 3}, triangles: ${allIndices.length / 3}`);
    onProgress?.(80);

    // VTK PolyData oluştur
    const polyData = vtkPolyData.newInstance();

    // Points ekle
    const points = vtkPoints.newInstance();
    points.setData(Float32Array.from(allVertices), 3);
    polyData.setPoints(points);

    // Polys (triangles) ekle
    const polys = vtkCellArray.newInstance();
    const polyArray: number[] = [];

    for (let i = 0; i < allIndices.length; i += 3) {
      polyArray.push(3); // Triangle
      polyArray.push(allIndices[i]);
      polyArray.push(allIndices[i + 1]);
      polyArray.push(allIndices[i + 2]);
    }

    polys.setData(Uint32Array.from(polyArray));
    polyData.setPolys(polys);
    // Normals ekle (varsa)
    if (allNormals.length > 0) {
      const normalData = Float32Array.from(allNormals);
      const normalsArray = vtkDataArray.newInstance({ 
        values: normalData, 
        numberOfComponents: 3 
      });
      polyData.getPointData().setNormals(normalsArray);
    }

    onProgress?.(100);

    return polyData;
  }
}
