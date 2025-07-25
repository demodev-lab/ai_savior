"use client";

import { useForm } from "react-hook-form";
import { CreateLectureForm, LectureWithCoach } from "@/types/lectures";
import { X } from "lucide-react";
import ModalPortal from "@/components/ModalPortal";
import { lecturesApi } from "@/app/api/lectures";
import { coachesApi } from "@/app/api/coaches";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface LectureModalProps {
  isOpen: boolean;
  onClose: () => void;
  isEdit?: boolean;
  lectureData?: LectureWithCoach | null;
}

export default function LectureModal({
  isOpen,
  onClose,
  isEdit = false,
  lectureData = null,
}: LectureModalProps) {
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [contentImageFiles, setContentImageFiles] = useState<File[]>([]);
  const [thumbnailPreview, setThumbnailPreview] = useState<string>("");
  const [contentImagePreviews, setContentImagePreviews] = useState<string[]>(
    [],
  );
  const [deletedImageUrls, setDeletedImageUrls] = useState<string[]>([]);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const contentImageInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<CreateLectureForm>({
    defaultValues: {
      title: "",
      description: "",
      thumbnail: "",
      content_image: "",
      content_url: "",
      content_text: "",
      url: "",
      start_date: "",
      apply_deadline: "",
      price: "",
      coach_id: "",
    },
  });

  const {
    data: coaches = [],
    isLoading: loadingCoaches,
    error: coachesError,
  } = useQuery({
    queryKey: ["coachOptions"],
    queryFn: coachesApi.getCoachOptions,
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (coachesError) {
    console.error("강사 목록 조회 실패:", coachesError);
  }

  // 편집 모드일 때 폼 데이터 초기화
  useEffect(() => {
    if (isEdit && lectureData && isOpen) {
      setValue("title", lectureData.title);
      setValue("description", lectureData.description);
      setValue("url", lectureData.url);
      setValue("content_url", lectureData.content_url || "");
      setValue("content_text", lectureData.content_text || "");
      setValue(
        "start_date",
        new Date(lectureData.start_date).toISOString().slice(0, 16),
      );
      setValue(
        "apply_deadline",
        new Date(lectureData.apply_deadline).toISOString().slice(0, 10),
      );
      setValue("price", lectureData.price.toString());

      // 기존 이미지 URL을 폼 필드에도 설정
      setValue("thumbnail", lectureData.thumbnail || null);
      // lectureData.content_image는 콤마로 구분된 문자열이므로, 이를 배열로 변환합니다.
      const existingImages = lectureData.content_image
        ? lectureData.content_image.split(",").map((s) => s.trim())
        : [];
      setValue("content_image", existingImages.join(","));

      // 기존 이미지 미리보기 설정
      if (lectureData.thumbnail) {
        setThumbnailPreview(lectureData.thumbnail);
      }
      if (lectureData.content_image) {
        setContentImagePreviews(existingImages);
      }
    } else if (!isEdit) {
      reset();
      setThumbnailPreview("");
      setContentImagePreviews([]);
      setDeletedImageUrls([]);
    }
  }, [isEdit, lectureData, isOpen, setValue, reset]);

  // 코치 목록이 로드된 후 coach_id 설정
  useEffect(() => {
    if (isEdit && lectureData && coaches.length > 0) {
      setValue("coach_id", lectureData.coach_id.toString());
    }
  }, [isEdit, lectureData, coaches, setValue]);

  // 미리보기 URL 정리 (메모리 누수 방지)
  useEffect(() => {
    return () => {
      if (thumbnailPreview && thumbnailPreview.startsWith("blob:")) {
        URL.revokeObjectURL(thumbnailPreview);
      }
      contentImagePreviews.forEach((preview) => {
        if (preview.startsWith("blob:")) {
          URL.revokeObjectURL(preview);
        }
      });
    };
  }, [thumbnailPreview, contentImagePreviews]);

  const handleRemoveThumbnail = () => {
    setThumbnailFile(null);
    setThumbnailPreview("");
    if (thumbnailInputRef.current) {
      thumbnailInputRef.current.value = "";
    }
    setValue("thumbnail", null);
  };

  const handleRemoveContentImage = (index: number) => {
    const removedPreview = contentImagePreviews[index];

    if (!removedPreview.startsWith("blob:")) {
      // 기존 이미지 URL인 경우 삭제 목록에 추가
      setDeletedImageUrls((prev) => [...prev, removedPreview]);
    } else {
      const objectURL = removedPreview;
      setContentImageFiles((prevFiles) =>
        prevFiles.filter((file) => {
          return URL.createObjectURL(file) !== objectURL;
        }),
      );
    }

    // 미리보기 목록에서 제거
    setContentImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const { mutate, isPending: isSubmitting } = useMutation({
    mutationFn: (data: CreateLectureForm) => {
      if (isEdit && lectureData) {
        // 편집 모드
        const originalImages = Array.isArray(lectureData.content_image)
          ? lectureData.content_image
          : (lectureData.content_image || "").split(",").filter(Boolean);
        const remainingImages = originalImages.filter(
          (url) => !deletedImageUrls.includes(url),
        );

        return lecturesApi.updateLecture(
          lectureData.id,
          data,
          thumbnailFile || undefined,
          contentImageFiles,
          lectureData.thumbnail,
          remainingImages, // 업데이트된 기존 이미지 목록
          deletedImageUrls, // 삭제할 이미지 URL 목록
        );
      } else {
        // 생성 모드
        return lecturesApi.createLecture({
          formData: data,
          thumbnailFile: thumbnailFile!,
          contentImageFiles: contentImageFiles,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminLectures"] });
      alert(
        isEdit
          ? "강의가 성공적으로 수정되었습니다!"
          : "강의가 성공적으로 생성되었습니다!",
      );
      handleClose();
    },
    onError: (error) => {
      console.error("강의 처리 중 오류:", error);
      alert(
        error instanceof Error
          ? error.message
          : "강의 처리 중 오류가 발생했습니다.",
      );
    },
  });

  const onSubmit = (data: CreateLectureForm) => {
    // 편집 모드가 아닐 때만 파일 필수 체크
    if (!isEdit) {
      if (!thumbnailFile) {
        alert("썸네일 이미지는 필수입니다.");
        return;
      }
    }
    mutate(data);
  };

  const handleClose = () => {
    reset();
    setThumbnailFile(null);
    setContentImageFiles([]);
    setThumbnailPreview("");
    setContentImagePreviews([]);
    setDeletedImageUrls([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      >
        <div
          className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {isEdit ? "강의 수정" : "새 강의 추가"}
            </h2>
            <button
              onClick={handleClose}
              className="rounded-full p-1 text-gray-600 transition-colors hover:bg-gray-100 hover:text-red-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* 강의 제목 */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                강의 제목 *
              </label>
              <input
                type="text"
                {...register("title", {
                  required: "강의 제목은 필수입니다.",
                  minLength: {
                    value: 2,
                    message: "제목은 최소 2자 이상이어야 합니다.",
                  },
                })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                placeholder="강의 제목을 입력하세요"
              />
              {errors.title && (
                <p className="mt-1 text-xs text-red-500">
                  {errors.title.message}
                </p>
              )}
            </div>

            {/* 강사 선택 */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                담당 강사 *
              </label>
              <select
                {...register("coach_id", {
                  required: "담당 강사를 선택해주세요.",
                })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                disabled={loadingCoaches}
              >
                <option value="">
                  {loadingCoaches
                    ? "강사 목록 불러오는 중..."
                    : "강사를 선택하세요"}
                </option>
                {coaches.map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {coach.name}
                  </option>
                ))}
              </select>
              {errors.coach_id && (
                <p className="mt-1 text-xs text-red-500">
                  {errors.coach_id.message}
                </p>
              )}
            </div>

            {/* 강의 설명 */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                강의 설명 *
              </label>
              <textarea
                {...register("description", {
                  required: "강의 설명은 필수입니다.",
                })}
                rows={3}
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                placeholder="강의에 대한 간단한 설명을 입력하세요"
              />
              {errors.description && (
                <p className="mt-1 text-xs text-red-500">
                  {errors.description.message}
                </p>
              )}
            </div>

            {/* 썸네일 이미지 */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                썸네일 이미지 {!isEdit && "*"}
              </label>
              <input
                type="file"
                accept="image/*"
                ref={thumbnailInputRef}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setThumbnailFile(file || null);

                  // 미리보기 URL 생성
                  if (file) {
                    // 기존 미리보기 URL 정리
                    if (
                      thumbnailPreview &&
                      thumbnailPreview.startsWith("blob:")
                    ) {
                      URL.revokeObjectURL(thumbnailPreview);
                    }
                    const previewUrl = URL.createObjectURL(file);
                    setThumbnailPreview(previewUrl);
                  } else {
                    setThumbnailPreview("");
                  }
                }}
                required={!isEdit}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-gray-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />

              {/* 썸네일 미리보기 */}
              {thumbnailPreview && (
                <div className="mt-2">
                  <p className="mb-1 text-xs text-gray-600">미리보기:</p>
                  <div className="relative h-32 w-48">
                    <Image
                      width={100}
                      height={100}
                      src={thumbnailPreview}
                      alt="썸네일 미리보기"
                      className="h-full w-full rounded-lg border object-cover"
                    />
                    <button
                      type="button"
                      onClick={handleRemoveThumbnail}
                      className="absolute top-1 right-1 rounded-full bg-black/50 p-1 text-white transition-colors hover:bg-black/70"
                      aria-label="썸네일 이미지 삭제"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}

              {!isEdit && !thumbnailFile && (
                <p className="mt-1 text-xs text-red-500">
                  썸네일 이미지는 필수입니다.
                </p>
              )}
              {isEdit && (
                <p className="mt-1 text-xs text-gray-500">
                  새 이미지를 선택하지 않으면 기존 이미지가 유지됩니다.
                </p>
              )}
            </div>
            {/* 강의 상세 내용 URL */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                강의 상세 내용 URL
              </label>
              <input
                type="url"
                {...register("content_url", {
                  pattern: {
                    value:
                      /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/,
                    message: "올바른 URL 형식을 입력하세요.",
                  },
                })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                placeholder="강의 상세 내용에 임베딩할 URL을 입력하세요."
              />
              {errors.content_url && (
                <p className="mt-1 text-xs text-red-500">
                  {errors.content_url.message}
                </p>
              )}
            </div>

            {/* 강의 상세 추가 텍스트 */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                강의 상세 내용
              </label>
              <textarea
                {...register("content_text")}
                rows={4}
                className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                placeholder="강의 소개에 표시될 텍스트입니다."
              />
              {errors.content_text && (
                <p className="mt-1 text-xs text-red-500">
                  {errors.content_text.message}
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                강의 상세 내용 이미지
              </label>
              <input
                type="file"
                accept="image/*"
                multiple // 여러 파일 선택 가능하도록 추가
                ref={contentImageInputRef}
                onChange={(e) => {
                  const files = e.target.files;
                  if (files) {
                    const newFiles = Array.from(files);
                    setContentImageFiles((prevFiles) => [
                      ...prevFiles,
                      ...newFiles,
                    ]);

                    // 미리보기 URL 생성
                    const newPreviews = newFiles.map((file) =>
                      URL.createObjectURL(file),
                    );
                    setContentImagePreviews((prevPreviews) => [
                      ...prevPreviews,
                      ...newPreviews,
                    ]);
                  }
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-gray-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />

              {/* 강의 상세 내용 이미지 미리보기 */}
              {contentImagePreviews.length > 0 && (
                <div className="mt-2">
                  <p className="mb-1 text-xs text-gray-600">미리보기:</p>
                  <div className="grid grid-cols-3 gap-2">
                    {contentImagePreviews.map((preview, index) => (
                      <div key={index} className="relative h-40 w-full">
                        <Image
                          width={100}
                          height={100}
                          src={preview}
                          alt={`강의 상세 내용 이미지 미리보기 ${index + 1}`}
                          className="h-full w-full rounded-lg border object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveContentImage(index)}
                          className="absolute top-1 right-1 rounded-full bg-black/50 p-1 text-white transition-colors hover:bg-black/70"
                          aria-label="강의 상세 내용 이미지 삭제"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="mt-1 text-xs text-gray-500">
                {isEdit
                  ? "새 이미지를 선택하지 않으면 기존 이미지가 유지됩니다."
                  : "강의 상세 내용과 함께 표시될 이미지를 선택하세요"}
              </p>
            </div>
            {/* 강의 URL */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                강의 URL
              </label>
              <input
                type="url"
                {...register("url", {
                  pattern: {
                    value: /^https?:\/\/.+/,
                    message: "올바른 URL 형식을 입력하세요",
                  },
                })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                placeholder="https://example.com/lecture"
              />
              {errors.url && (
                <p className="mt-1 text-xs text-red-500">
                  {errors.url.message}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* 시작 날짜 */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  시작 날짜 *
                </label>
                <input
                  type="datetime-local"
                  {...register("start_date", {
                    required: "시작 날짜는 필수입니다.",
                  })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
                {errors.start_date && (
                  <p className="mt-1 text-xs text-red-500">
                    {errors.start_date.message}
                  </p>
                )}
              </div>

              {/* 신청 마감일 */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  신청 마감일 *
                </label>
                <input
                  type="date"
                  {...register("apply_deadline", {
                    required: "신청 마감일은 필수입니다.",
                  })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
                {errors.apply_deadline && (
                  <p className="mt-1 text-xs text-red-500">
                    {errors.apply_deadline.message}
                  </p>
                )}
              </div>
            </div>

            {/* 가격 */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                가격 *
              </label>
              <input
                type="text"
                {...register("price", {
                  required: "가격은 필수입니다.",
                })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                placeholder="예: 무료, 50,000원, $99 등"
              />
              {errors.price && (
                <p className="mt-1 text-xs text-red-500">
                  {errors.price.message}
                </p>
              )}
            </div>

            {/* 버튼 */}
            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isSubmitting || loadingCoaches}
                className="rounded-lg bg-black px-4 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {isSubmitting
                  ? isEdit
                    ? "수정 중..."
                    : "생성 중..."
                  : isEdit
                    ? "수정"
                    : "생성"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
