"use client";

import React, { useState, useCallback } from "react";
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Typography,
  Popconfirm,
  Tag,
  message,
  Empty,
  Spin,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ExperimentOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { modelsApi } from "@/lib/api";
import { ModelIcon, ProviderIcon } from "@/lib/icons";
import type { ModelConfig, ModelFormData } from "@/types";

const { Title } = Typography;

/** 模型类型标签颜色映射 */
const modelTypeColors: Record<string, string> = {
  chat: "blue",
  embedding: "green",
  image: "purple",
  audio: "orange",
};

/** 提供商标签颜色 */
const providerColors: Record<string, string> = {
  openai: "green",
  anthropic: "orange",
  custom: "default",
};

export default function ModelsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelConfig | null>(null);
  const [form] = Form.useForm();

  // 查询模型列表
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["models"],
    queryFn: modelsApi.list,
  });

  // 创建模型
  const createMutation = useMutation({
    mutationFn: (values: ModelFormData) => modelsApi.create(values),
    onSuccess: () => {
      message.success("模型创建成功");
      queryClient.invalidateQueries({ queryKey: ["models"] });
      handleCloseModal();
    },
    onError: (err: Error) => message.error(err.message),
  });

  // 更新模型
  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<ModelFormData>;
    }) => modelsApi.update(id, data),
    onSuccess: () => {
      message.success("模型更新成功");
      queryClient.invalidateQueries({ queryKey: ["models"] });
      handleCloseModal();
    },
    onError: (err: Error) => message.error(err.message),
  });

  // 删除模型
  const deleteMutation = useMutation({
    mutationFn: (id: string) => modelsApi.delete(id),
    onSuccess: () => {
      message.success("模型已删除");
      queryClient.invalidateQueries({ queryKey: ["models"] });
    },
    onError: (err: Error) => message.error(err.message),
  });

  const handleOpenCreate = () => {
    setEditingModel(null);
    form.resetFields();
    form.setFieldsValue({
      provider: "openai",
      model_type: "chat",
      input_price: 0,
      output_price: 0,
    });
    setModalOpen(true);
  };

  const handleOpenEdit = (model: ModelConfig) => {
    setEditingModel(model);
    form.setFieldsValue({
      model_name: model.model_name,
      provider: model.provider,
      api_base: model.api_base,
      api_key: "",
      input_price: model.input_price,
      output_price: model.output_price,
      model_type: model.model_type,
    });
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingModel(null);
    form.resetFields();
  };

  const handleSubmit = async () => {
    const values = await form.validateFields();
    if (editingModel) {
      // 编辑时如果不修改 key 则不传 api_key
      const data: Partial<ModelFormData> = { ...values };
      if (!data.api_key) delete data.api_key;
      updateMutation.mutate({ id: editingModel.id, data });
    } else {
      createMutation.mutate(values);
    }
  };

  const columns = [
    { title: "模型名称", dataIndex: "model_name", key: "model_name",
      render: (v: string) => <ModelIcon modelName={v} /> },
    {
      title: "提供商",
      dataIndex: "provider",
      key: "provider",
      render: (v: string) => <ProviderIcon provider={v} />,
    },
    {
      title: "类型",
      dataIndex: "model_type",
      key: "model_type",
      render: (v: string) => (
        <Tag color={modelTypeColors[v] || "default"}>{v}</Tag>
      ),
    },
    { title: "API 地址", dataIndex: "api_base", key: "api_base", ellipsis: true },
    {
      title: "API Key",
      dataIndex: "api_key_masked",
      key: "api_key_masked",
      render: (v: string) => <code>{v}</code>,
    },
    {
      title: "输入价格 (¥/1M tokens)",
      dataIndex: "input_price",
      key: "input_price",
      render: (v: number) => (v ? `¥${v}` : "-"),
    },
    {
      title: "输出价格 (¥/1M tokens)",
      dataIndex: "output_price",
      key: "output_price",
      render: (v: number) => (v ? `¥${v}` : "-"),
    },
    {
      title: "操作",
      key: "actions",
      width: 180,
      render: (_: any, record: ModelConfig) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除此模型？"
            description="删除后不可恢复"
            onConfirm={() => deleteMutation.mutate(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <Title level={4} style={{ margin: 0 }}>
          模型管理
        </Title>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
            添加模型
          </Button>
        </Space>
      </div>

      {isLoading ? (
        <div style={{ textAlign: "center", padding: 100 }}>
          <Spin size="large" />
        </div>
      ) : (
        <Table
          dataSource={data?.models || []}
          columns={columns}
          rowKey="id"
          pagination={false}
          size="small"
          scroll={{ x: 1000 }}
          locale={{ emptyText: <Empty description="暂无模型，点击上方「添加模型」开始" /> }}
        />
      )}

      {/* 添加/编辑模型模态框 */}
      <Modal
        title={editingModel ? "编辑模型" : "添加模型"}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={handleCloseModal}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        destroyOnHidden
        width={560}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="model_name"
            label="模型名称"
            rules={[{ required: true, message: "请输入模型名称" }]}
          >
            <Input placeholder="如 gpt-4o, claude-3.5-sonnet" />
          </Form.Item>

          <Form.Item
            name="provider"
            label="提供商"
            rules={[{ required: true, message: "请选择提供商" }]}
          >
            <Select
              options={[
                { label: "OpenAI", value: "openai" },
                { label: "Anthropic", value: "anthropic" },
                { label: "自定义", value: "custom" },
              ]}
            />
          </Form.Item>

          <Form.Item
            name="api_base"
            label="API 地址"
            rules={[{ required: true, message: "请输入 API 地址" }]}
          >
            <Input placeholder="https://api.openai.com/v1" />
          </Form.Item>

          <Form.Item
            name="api_key"
            label={editingModel ? "API Key（留空不修改）" : "API Key"}
            rules={
              editingModel
                ? []
                : [{ required: true, message: "请输入 API Key" }]
            }
          >
            <Input.Password
              placeholder={editingModel ? "留空则保持原 Key 不变" : "sk-xxxx"}
            />
          </Form.Item>

          <Form.Item name="model_type" label="模型类型">
            <Select
              options={[
                { label: "对话 (Chat)", value: "chat" },
                { label: "嵌入 (Embedding)", value: "embedding" },
                { label: "图像 (Image)", value: "image" },
                { label: "音频 (Audio)", value: "audio" },
              ]}
            />
          </Form.Item>

          <Space style={{ width: "100%" }} size="middle">
            <Form.Item name="input_price" label="输入价格 (¥/1M tokens)">
              <InputNumber
                placeholder="0"
                min={0}
                step={0.01}
                style={{ width: 200 }}
              />
            </Form.Item>
            <Form.Item name="output_price" label="输出价格 (¥/1M tokens)">
              <InputNumber
                placeholder="0"
                min={0}
                step={0.01}
                style={{ width: 200 }}
              />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}
