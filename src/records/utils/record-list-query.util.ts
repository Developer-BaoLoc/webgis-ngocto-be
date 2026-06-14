export type RecordListSortBy = 'createdAt' | 'updatedAt';
export type RecordListSortOrder = 'asc' | 'desc';

export type RecordListQueryInput = {
  page?: string | number;
  pageSize?: string | number;
  sortBy?: string;
  sortOrder?: string;
  q?: string;
};

export type ParsedRecordListQuery = {
  page: number;
  pageSize: number;
  sortBy: RecordListSortBy;
  sortOrder: RecordListSortOrder;
  q?: string;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;

export function parseRecordListQuery(input: {
  page?: string | number;
  pageSize?: string | number;
  sortBy?: string;
  sortOrder?: string;
  q?: string;
}): ParsedRecordListQuery {
  const pageNumber = Number(input.page ?? 1);
  const pageSizeNumber = Number(input.pageSize ?? DEFAULT_PAGE_SIZE);

  const page = Number.isFinite(pageNumber) && pageNumber >= 1 ? Math.floor(pageNumber) : 1;
  const pageSize = Number.isFinite(pageSizeNumber)
    ? Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(pageSizeNumber)))
    : DEFAULT_PAGE_SIZE;

  const sortBy: RecordListSortBy =
    input.sortBy === 'updatedAt' ? 'updatedAt' : 'createdAt';
  const sortOrder: RecordListSortOrder =
    input.sortOrder === 'asc' ? 'asc' : 'desc';

  const q = input.q?.trim() || undefined;

  return { page, pageSize, sortBy, sortOrder, q };
}
